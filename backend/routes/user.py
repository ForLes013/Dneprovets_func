# routes/user.py
from flask import Blueprint, request, jsonify
from flask_cors import cross_origin
from models import db, User, Token, Payment, Attendance, Branch, AgeSchedule, Application
from payment_service import (
    PaymentProviderError,
    create_yookassa_payment,
    is_real_payments_enabled,
    resolve_payment_return_url,
    sync_local_payment_with_yookassa,
    sync_payment_from_yookassa_notification,
)
from utils import (
    DEFAULT_PAYMENT_PLANS,
    DEFAULT_CONTACT_INFO,
    DEFAULT_TRAINERS,
    filter_schedules_by_birth_year,
    generate_token,
    get_child_info,
    get_age_group_from_birth_year,
    get_site_setting_value,
    get_user_children,
    hash_password,
    logger,
    login_required,
    normalize_birth_year,
    normalize_children_payload,
    normalize_payment_plans_payload,
    parse_days_of_week,
    sync_payment_counters,
)
from datetime import datetime, timedelta
import json
import calendar

bp = Blueprint('user', __name__)


def serialize_payment(payment, *, child_name=None, branch=None):
    resolved_branch = branch or (Branch.query.get(payment.branch_id) if payment.branch_id else None)
    return {
        'id': payment.id,
        'child_id': payment.child_id,
        'child_name': child_name,
        'branch_id': payment.branch_id,
        'branch_name': resolved_branch.name if resolved_branch else 'Не указан',
        'amount': payment.amount,
        'training_count': payment.training_count,
        'used_trainings': payment.used_trainings,
        'remaining_trainings': payment.remaining_trainings,
        'start_date': payment.start_date.isoformat() if payment.start_date else None,
        'end_date': payment.end_date.isoformat() if payment.end_date else None,
        'status': payment.status,
        'payment_method': payment.payment_method,
        'transaction_id': payment.transaction_id,
        'provider': payment.provider,
        'provider_status': payment.provider_status,
        'payment_url': payment.provider_confirmation_url,
        'paid_at': payment.paid_at.isoformat() if payment.paid_at else None,
        'created_at': payment.created_at.isoformat() if payment.created_at else None,
    }


def _resolve_selected_payment_plan(data):
    payment_plans = normalize_payment_plans_payload(
        get_site_setting_value('payment_plans', DEFAULT_PAYMENT_PLANS)
    )

    try:
        requested_amount = int(data.get('amount'))
        requested_training_count = int(data.get('training_count'))
    except (TypeError, ValueError):
        raise ValueError('Некорректные параметры тарифа')

    requested_plan_id = str(data.get('plan_id') or '').strip()
    if requested_plan_id:
        selected_plan = next(
            (
                plan for plan in payment_plans
                if str(plan.get('id') or '').strip() == requested_plan_id
            ),
            None,
        )
    else:
        selected_plan = next(
            (
                plan for plan in payment_plans
                if plan.get('price') == requested_amount
                and plan.get('trainings') == requested_training_count
            ),
            None,
        )

    if not selected_plan:
        raise ValueError('Выбранный тариф не найден. Обновите страницу и попробуйте снова')

    if (
        selected_plan.get('price') != requested_amount
        or selected_plan.get('trainings') != requested_training_count
    ):
        raise ValueError('Тариф был изменен. Обновите страницу и попробуйте снова')

    return selected_plan


@login_required
def get_user_payments_real():
    try:
        user_id = request.user_id
        payments = (
            Payment.query.filter_by(user_id=user_id)
            .order_by(Payment.created_at.desc())
            .all()
        )
        user = User.query.get(user_id)
        children = get_user_children(user) if user else []
        child_map = {str(child.get('id')): child.get('name') for child in children}

        payments_data = []
        for payment in payments:
            branch = Branch.query.get(payment.branch_id) if payment.branch_id else None
            payments_data.append(
                serialize_payment(
                    payment,
                    child_name=child_map.get(str(payment.child_id)),
                    branch=branch,
                )
            )

        return jsonify({
            'success': True,
            'payments': payments_data,
        })
    except Exception as e:
        logger.error(f"Ошибка получения платежей пользователя: {str(e)}")
        return jsonify({'error': 'Ошибка получения платежей пользователя'}), 500


@login_required
def create_payment_real():
    try:
        user_id = request.user_id
        data = request.get_json() or {}

        required_fields = ['child_id', 'amount', 'training_count', 'birth_year']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Отсутствует обязательное поле: {field}'}), 400

        selected_plan = _resolve_selected_payment_plan(data)
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'Пользователь не найден'}), 404

        child_info = get_child_info(user, data['child_id'])
        if not child_info:
            return jsonify({'error': 'Ребенок не найден у текущего пользователя'}), 400

        child_name = child_info.get('name') or data.get('child_name') or 'Ребенок'
        normalized_birth_year = normalize_birth_year(data['birth_year'])
        if not normalized_birth_year:
            return jsonify({'error': 'Некорректный год рождения'}), 400

        branch_id = data.get('branch_id')
        if not branch_id:
            return jsonify({'error': 'Не указан филиал'}), 400

        schedules = filter_schedules_by_birth_year(
            AgeSchedule.query.filter_by(
                branch_id=branch_id,
                is_active=True
            ).all(),
            normalized_birth_year,
        )
        if not schedules:
            return jsonify({
                'error': f'Нет расписания для филиала {branch_id} и года рождения {normalized_birth_year}'
            }), 400

        payment = Payment(
            user_id=user_id,
            child_id=data['child_id'],
            branch_id=branch_id,
            amount=selected_plan['price'],
            training_count=selected_plan['trainings'],
            remaining_trainings=selected_plan['trainings'],
            start_date=datetime.utcnow(),
            end_date=datetime.utcnow() + timedelta(days=30),
            status='pending',
            provider='manual',
            payment_method=data.get('payment_method', 'card'),
            transaction_id=data.get('transaction_id', f'trans-{datetime.utcnow().timestamp()}'),
        )

        db.session.add(payment)
        db.session.flush()

        response_message = 'Платеж создан и ожидает подтверждения'
        confirmation_url = None

        if is_real_payments_enabled():
            resolved_return_url = resolve_payment_return_url(
                payment.id,
                data.get('return_url'),
            )
            create_yookassa_payment(
                payment,
                return_url=resolved_return_url,
                description=f"Тренировки для {child_name} — {selected_plan.get('name') or 'Тариф'}",
                customer_email=user.email,
            )
            confirmation_url = payment.provider_confirmation_url
            if not confirmation_url:
                raise PaymentProviderError('ЮKassa не вернула ссылку для подтверждения оплаты')
            response_message = 'Платеж создан. Перенаправляем на оплату в ЮKassa.'

        db.session.commit()

        return jsonify({
            'success': True,
            'message': response_message,
            'payment': {
                'id': payment.id,
                'amount': payment.amount,
                'training_count': payment.training_count,
                'used_trainings': payment.used_trainings,
                'remaining_trainings': payment.remaining_trainings,
                'status': payment.status,
                'provider': payment.provider,
                'provider_status': payment.provider_status,
                'confirmation_url': confirmation_url,
                'created_at': payment.created_at.isoformat() if payment.created_at else None,
            }
        })
    except ValueError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400
    except PaymentProviderError as e:
        db.session.rollback()
        logger.error("Ошибка провайдера оплаты: %s", str(e))
        return jsonify({'error': str(e)}), 502
    except Exception as e:
        db.session.rollback()
        logger.error(f"Ошибка создания реального платежа: {str(e)}")
        return jsonify({'error': f'Ошибка создания платежа: {str(e)}'}), 500


@bp.route('/api/payments/<int:payment_id>/sync', methods=['POST'])
@login_required
def sync_payment_status(payment_id):
    try:
        payment = Payment.query.get(payment_id)
        if not payment:
            return jsonify({'error': 'Платеж не найден'}), 404

        if payment.user_id != request.user_id:
            return jsonify({'error': 'Нет доступа к этому платежу'}), 403

        if payment.provider != 'yookassa' or not payment.provider_payment_id:
            return jsonify({
                'success': True,
                'payment': serialize_payment(payment),
                'synced': False,
            })

        sync_result = sync_local_payment_with_yookassa(payment)
        return jsonify({
            'success': True,
            'synced': True,
            'payment': serialize_payment(sync_result['payment']),
        })
    except ValueError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400
    except PaymentProviderError as e:
        db.session.rollback()
        logger.error("Ошибка синхронизации платежа с ЮKassa: %s", str(e))
        return jsonify({'error': str(e)}), 502
    except Exception as e:
        db.session.rollback()
        logger.error("Ошибка синхронизации платежа %s: %s", payment_id, str(e))
        return jsonify({'error': 'Не удалось синхронизировать платеж'}), 500


@bp.route('/api/payments/webhook/yookassa', methods=['POST'])
def yookassa_webhook():
    payload = request.get_json(silent=True) or {}
    try:
        sync_result = sync_payment_from_yookassa_notification(payload)
        if not sync_result:
            return jsonify({'success': True, 'ignored': True})
        return jsonify({
            'success': True,
            'payment_id': sync_result['payment'].id,
            'status': sync_result['payment'].status,
        })
    except ValueError as e:
        logger.warning("Некорректный webhook YooKassa: %s", str(e))
        return jsonify({'error': str(e)}), 400
    except PaymentProviderError as e:
        db.session.rollback()
        logger.error("Ошибка провайдера в webhook YooKassa: %s", str(e))
        return jsonify({'error': str(e)}), 502
    except Exception as e:
        db.session.rollback()
        logger.error("Ошибка обработки webhook YooKassa: %s", str(e))
        return jsonify({'error': 'Не удалось обработать webhook'}), 500



# ========== РџР РћР¤РР›Р¬ РџРћР›Р¬Р—РћР’РђРўР•Р›РЇ ==========

@bp.route('/api/profile', methods=['GET'])
@login_required
def get_profile():
    """РџРѕР»СѓС‡РµРЅРёРµ РїСЂРѕС„РёР»СЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ"""
    try:
        user_id = request.user_id
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ'}), 404
        
        children = []
        if user.children:
            if isinstance(user.children, list):
                children = user.children
            elif isinstance(user.children, str):
                try:
                    children = json.loads(user.children)
                except:
                    children = []
        
        return jsonify({
            'success': True,
            'user': {
                'id': user.id,
                'name': user.name,
                'email': user.email,
                'phone': user.phone,
                'children': children,
                'registered_at': user.registered_at.isoformat() if user.registered_at else None
            }
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РїСЂРѕС„РёР»СЏ: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РїСЂРѕС„РёР»СЏ'}), 500
    
@bp.route('/api/attendance/mark-missed', methods=['POST'])
@login_required
def mark_missed_attendance():
    """РћС‚РјРµС‚РёС‚СЊ С‚СЂРµРЅРёСЂРѕРІРєСѓ РєР°Рє РїСЂРѕРїСѓС‰РµРЅРЅСѓСЋ"""
    try:
        user_id = request.user_id
        data = request.get_json()
        
        if not data or 'attendance_id' not in data:
            return jsonify({'error': 'РћС‚СЃСѓС‚СЃС‚РІСѓРµС‚ ID РїРѕСЃРµС‰РµРЅРёСЏ'}), 400
        
        attendance = Attendance.query.get(data['attendance_id'])
        
        if not attendance:
            return jsonify({'error': 'Р—Р°РїРёСЃСЊ Рѕ РїРѕСЃРµС‰РµРЅРёРё РЅРµ РЅР°Р№РґРµРЅР°'}), 404
        
        # РџСЂРѕРІРµСЂСЏРµРј, С‡С‚Рѕ РїРѕСЃРµС‰РµРЅРёРµ РїСЂРёРЅР°РґР»РµР¶РёС‚ РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ
        if attendance.user_id != user_id:
            return jsonify({'error': 'РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїСЂР°РІ'}), 403
        
        # РџСЂРѕРІРµСЂСЏРµРј СЃС‚Р°С‚СѓСЃ
        if attendance.status != 'scheduled':
            return jsonify({'error': 'РўРѕР»СЊРєРѕ Р·Р°РїР»Р°РЅРёСЂРѕРІР°РЅРЅС‹Рµ С‚СЂРµРЅРёСЂРѕРІРєРё РјРѕР¶РЅРѕ РѕС‚РјРµС‚РёС‚СЊ РєР°Рє РїСЂРѕРїСѓС‰РµРЅРЅС‹Рµ'}), 400
        
        # РџСЂРѕРІРµСЂСЏРµРј, С‡С‚Рѕ РґР°С‚Р° С‚СЂРµРЅРёСЂРѕРІРєРё СѓР¶Рµ РїСЂРѕС€Р»Р°
        if attendance.scheduled_date and attendance.scheduled_date > datetime.utcnow():
            return jsonify({'error': 'РќРµР»СЊР·СЏ РѕС‚РјРµС‚РёС‚СЊ Р±СѓРґСѓС‰СѓСЋ С‚СЂРµРЅРёСЂРѕРІРєСѓ РєР°Рє РїСЂРѕРїСѓС‰РµРЅРЅСѓСЋ'}), 400
        
        # РћР±РЅРѕРІР»СЏРµРј СЃС‚Р°С‚СѓСЃ
        attendance.status = 'missed'
        attendance.notes = f"РџСЂРѕРїСѓСЃРє: {data.get('notes', 'РџСЂРёС‡РёРЅР° РЅРµ СѓРєР°Р·Р°РЅР°')}"
        attendance.actual_date = datetime.utcnow()
        
        db.session.commit()
        
        logger.info(f"вњ… РўСЂРµРЅРёСЂРѕРІРєР° РѕС‚РјРµС‡РµРЅР° РєР°Рє РїСЂРѕРїСѓС‰РµРЅРЅР°СЏ: attendance_id={attendance.id}, user_id={user_id}")
        
        return jsonify({
            'success': True,
            'message': 'РўСЂРµРЅРёСЂРѕРІРєР° РѕС‚РјРµС‡РµРЅР° РєР°Рє РїСЂРѕРїСѓС‰РµРЅРЅР°СЏ',
            'attendance': {
                'id': attendance.id,
                'status': attendance.status,
                'notes': attendance.notes
            }
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"вќЊ РћС€РёР±РєР° РѕС‚РјРµС‚РєРё РїСЂРѕРїСѓСЃРєР°: {str(e)}")
        return jsonify({'error': f'РћС€РёР±РєР° РѕС‚РјРµС‚РєРё РїСЂРѕРїСѓСЃРєР°: {str(e)}'}), 500

@bp.route('/api/attendance/reschedule-missed', methods=['POST'])
@login_required
def reschedule_missed_attendance():
    """РџРµСЂРµРЅРµСЃС‚Рё РїСЂРѕРїСѓС‰РµРЅРЅСѓСЋ С‚СЂРµРЅРёСЂРѕРІРєСѓ РЅР° РґСЂСѓРіСѓСЋ РґР°С‚Сѓ"""
    try:
        user_id = request.user_id
        data = request.get_json()
        
        required_fields = ['attendance_id', 'new_date']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'РћС‚СЃСѓС‚СЃС‚РІСѓРµС‚ РїРѕР»Рµ: {field}'}), 400
        
        # РџРѕР»СѓС‡Р°РµРј РёСЃС…РѕРґРЅСѓСЋ Р·Р°РїРёСЃСЊ Рѕ РїСЂРѕРїСѓСЃРєРµ
        attendance = Attendance.query.get(data['attendance_id'])
        
        if not attendance:
            return jsonify({'error': 'Р—Р°РїРёСЃСЊ Рѕ РїРѕСЃРµС‰РµРЅРёРё РЅРµ РЅР°Р№РґРµРЅР°'}), 404
        
        # РџСЂРѕРІРµСЂСЏРµРј РїСЂР°РІР°
        if attendance.user_id != user_id:
            return jsonify({'error': 'РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїСЂР°РІ'}), 403
        
        # РџСЂРѕРІРµСЂСЏРµРј, С‡С‚Рѕ СЌС‚Рѕ РїСЂРѕРїСѓС‰РµРЅРЅР°СЏ С‚СЂРµРЅРёСЂРѕРІРєР°
        if attendance.status != 'missed':
            return jsonify({'error': 'РњРѕР¶РЅРѕ РїРµСЂРµРЅРѕСЃРёС‚СЊ С‚РѕР»СЊРєРѕ РїСЂРѕРїСѓС‰РµРЅРЅС‹Рµ С‚СЂРµРЅРёСЂРѕРІРєРё'}), 400
        
        # РџР°СЂСЃРёРј РЅРѕРІСѓСЋ РґР°С‚Сѓ
        try:
            new_date = datetime.fromisoformat(data['new_date'].replace('Z', '+00:00'))
        except:
            return jsonify({'error': 'РќРµРІРµСЂРЅС‹Р№ С„РѕСЂРјР°С‚ РґР°С‚С‹'}), 400
        
        # РџСЂРѕРІРµСЂСЏРµРј, С‡С‚Рѕ РЅРѕРІР°СЏ РґР°С‚Р° РІ Р±СѓРґСѓС‰РµРј
        if new_date <= datetime.utcnow():
            return jsonify({'error': 'РќРѕРІР°СЏ РґР°С‚Р° РґРѕР»Р¶РЅР° Р±С‹С‚СЊ РІ Р±СѓРґСѓС‰РµРј'}), 400
        
        # РџРѕР»СѓС‡Р°РµРј РёРЅС„РѕСЂРјР°С†РёСЋ Рѕ РїР»Р°С‚РµР¶Рµ Рё СЂРµР±РµРЅРєРµ
        payment = Payment.query.get(attendance.payment_id)
        user = User.query.get(user_id)
        
        if not payment or payment.status != 'confirmed':
            return jsonify({'error': 'РќРµС‚ Р°РєС‚РёРІРЅРѕР№ РѕРїР»Р°С‚С‹ РґР»СЏ РїРµСЂРµРЅРѕСЃР°'}), 400
        
        if not user or not get_user_children(user):
            return jsonify({'error': 'РРЅС„РѕСЂРјР°С†РёСЏ Рѕ СЂРµР±РµРЅРєРµ РЅРµ РЅР°Р№РґРµРЅР°'}), 400
        
        # РќР°С…РѕРґРёРј РёРЅС„РѕСЂРјР°С†РёСЋ Рѕ СЂРµР±РµРЅРєРµ
        child_info = get_child_info(user, attendance.child_id)
        
        if not child_info:
            return jsonify({'error': 'Р РµР±РµРЅРѕРє РЅРµ РЅР°Р№РґРµРЅ'}), 404
        
        # РџРѕР»СѓС‡Р°РµРј РІРѕР·СЂР°СЃС‚РЅСѓСЋ РіСЂСѓРїРїСѓ
        birth_year = child_info.get('birth_year')
        if not birth_year:
            return jsonify({'error': 'РќРµ СѓРєР°Р·Р°РЅ РіРѕРґ СЂРѕР¶РґРµРЅРёСЏ СЂРµР±РµРЅРєР°'}), 400
        
        normalized_birth_year = normalize_birth_year(birth_year)
        if not normalized_birth_year:
            return jsonify({'error': 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕРїСЂРµРґРµР»РёС‚СЊ РіРѕРґ СЂРѕР¶РґРµРЅРёСЏ СЂРµР±РµРЅРєР°'}), 400
        
        # РќР°С…РѕРґРёРј СЂР°СЃРїРёСЃР°РЅРёРµ РґР»СЏ РЅРѕРІРѕРіРѕ РІСЂРµРјРµРЅРё
        schedules = filter_schedules_by_birth_year(
            AgeSchedule.query.filter_by(
                branch_id=attendance.branch_id,
                is_active=True
            ).all(),
            normalized_birth_year,
        )
        schedule = schedules[0] if schedules else None
        
        if not schedule:
            return jsonify({'error': 'РќРµС‚ СЂР°СЃРїРёСЃР°РЅРёСЏ РґР»СЏ РІС‹Р±СЂР°РЅРЅРѕР№ РІРѕР·СЂР°СЃС‚РЅРѕР№ РіСЂСѓРїРїС‹'}), 400
        
        # РџСЂРѕРІРµСЂСЏРµРј РґРЅРё РЅРµРґРµР»Рё
        schedule_days = parse_days_of_week(schedule.days_of_week)
        
        if new_date.weekday() not in schedule_days:
            return jsonify({'error': 'Р’С‹Р±СЂР°РЅРЅР°СЏ РґР°С‚Р° РЅРµ СЃРѕРѕС‚РІРµС‚СЃС‚РІСѓРµС‚ СЂР°СЃРїРёСЃР°РЅРёСЋ С„РёР»РёР°Р»Р°'}), 400
        
        # РџСЂРѕРІРµСЂСЏРµРј РµРјРєРѕСЃС‚СЊ
        scheduled_count = Attendance.query.filter(
            Attendance.schedule_id == schedule.id,
            Attendance.scheduled_date == new_date,
            Attendance.status.in_(['scheduled', 'attended', 'rescheduled'])
        ).count()
        
        if scheduled_count >= schedule.capacity:
            return jsonify({'error': 'РќР° СЌС‚Рѕ РІСЂРµРјСЏ РЅРµС‚ СЃРІРѕР±РѕРґРЅС‹С… РјРµСЃС‚'}), 400
        
        # РџСЂРѕРІРµСЂСЏРµРј, РЅРµ Р·Р°РїРёСЃР°РЅ Р»Рё СѓР¶Рµ СЂРµР±РµРЅРѕРє РЅР° СЌС‚Сѓ РґР°С‚Сѓ
        existing_attendance = Attendance.query.filter(
            Attendance.user_id == user_id,
            Attendance.child_id == attendance.child_id,
            Attendance.scheduled_date == new_date,
            Attendance.status.in_(['scheduled', 'attended', 'rescheduled'])
        ).first()
        
        if existing_attendance:
            return jsonify({'error': 'Р РµР±РµРЅРѕРє СѓР¶Рµ Р·Р°РїРёСЃР°РЅ РЅР° СЌС‚Сѓ РґР°С‚Сѓ'}), 400
        
        # РЎРѕР·РґР°РµРј РЅРѕРІСѓСЋ Р·Р°РїРёСЃСЊ РґР»СЏ РїРµСЂРµРЅРµСЃРµРЅРЅРѕР№ С‚СЂРµРЅРёСЂРѕРІРєРё
        new_attendance = Attendance(
            user_id=user_id,
            child_id=attendance.child_id,
            payment_id=attendance.payment_id,
            schedule_id=schedule.id,
            scheduled_date=new_date,
            age_group=age_group,
            branch_id=attendance.branch_id,
            status='rescheduled',
            notes=f"РџРµСЂРµРЅРѕСЃ РїСЂРѕРїСѓС‰РµРЅРЅРѕР№ С‚СЂРµРЅРёСЂРѕРІРєРё РѕС‚ {attendance.scheduled_date.date() if attendance.scheduled_date else '?'}. "
                  f"РџСЂРёС‡РёРЅР°: {data.get('reason', 'РќРµ СѓРєР°Р·Р°РЅР°')}",
            is_makeup=True
        )
        
        # РћР±РЅРѕРІР»СЏРµРј РёСЃС…РѕРґРЅСѓСЋ Р·Р°РїРёСЃСЊ
        attendance.notes = f"РџРµСЂРµРЅРµСЃРµРЅРѕ РЅР° {new_date.date()}. {attendance.notes}"

        sync_payment_counters(payment)
        
        db.session.add(new_attendance)
        db.session.commit()
        
        logger.info(f"вњ… РўСЂРµРЅРёСЂРѕРІРєР° РїРµСЂРµРЅРµСЃРµРЅР°: {attendance.id} -> {new_attendance.id}, user_id={user_id}")
        
        return jsonify({
            'success': True,
            'message': 'РўСЂРµРЅРёСЂРѕРІРєР° СѓСЃРїРµС€РЅРѕ РїРµСЂРµРЅРµСЃРµРЅР°',
            'new_attendance': {
                'id': new_attendance.id,
                'scheduled_date': new_attendance.scheduled_date.isoformat() if new_attendance.scheduled_date else None,
                'status': new_attendance.status
            }
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"вќЊ РћС€РёР±РєР° РїРµСЂРµРЅРѕСЃР° С‚СЂРµРЅРёСЂРѕРІРєРё: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': f'РћС€РёР±РєР° РїРµСЂРµРЅРѕСЃР° С‚СЂРµРЅРёСЂРѕРІРєРё: {str(e)}'}), 500

# Р”РѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹Р№ СЌРЅРґРїРѕРёРЅС‚ РґР»СЏ РїРѕР»СѓС‡РµРЅРёСЏ РїСЂРёС‡РёРЅ РїСЂРѕРїСѓСЃРєРѕРІ
@bp.route('/api/attendance/missed-reasons', methods=['GET'])
@login_required
def get_missed_reasons():
    """РџРѕР»СѓС‡РµРЅРёРµ СЃРїРёСЃРєР° СЃС‚Р°РЅРґР°СЂС‚РЅС‹С… РїСЂРёС‡РёРЅ РїСЂРѕРїСѓСЃРєРѕРІ"""
    try:
        reasons = [
            "Р‘РѕР»РµР·РЅСЊ",
            "РћС‚РїСѓСЃРє",
            "РЎРµРјРµР№РЅС‹Рµ РѕР±СЃС‚РѕСЏС‚РµР»СЊСЃС‚РІР°",
            "РџРѕРіРѕРґРЅС‹Рµ СѓСЃР»РѕРІРёСЏ",
            "РўСЂР°РЅСЃРїРѕСЂС‚РЅС‹Рµ РїСЂРѕР±Р»РµРјС‹",
            "Р”СЂСѓРіР°СЏ РїСЂРёС‡РёРЅР°"
        ]
        
        return jsonify({
            'success': True,
            'reasons': reasons
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РїСЂРёС‡РёРЅ РїСЂРѕРїСѓСЃРєРѕРІ: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РґР°РЅРЅС‹С…'}), 500

@bp.route('/api/profile', methods=['PUT'])
@login_required
def update_profile():
    """РћР±РЅРѕРІР»РµРЅРёРµ РїСЂРѕС„РёР»СЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ"""
    try:
        user_id = request.user_id
        data = request.get_json() or {}

        if 'amount' not in data or 'training_count' not in data or 'plan_id' not in data:
            user = User.query.get(user_id)

            if not user:
                return jsonify({'error': 'Пользователь не найден'}), 404

            if 'name' in data:
                user.name = data['name']
            if 'phone' in data:
                user.phone = data['phone']
            if 'email' in data:
                user.email = data['email']
            if 'children' in data:
                user.children = normalize_children_payload(data['children'], user.id)

            db.session.commit()

            return jsonify({
                'success': True,
                'message': 'Профиль обновлён',
                'user': {
                    'id': user.id,
                    'name': user.name,
                    'email': user.email,
                    'phone': user.phone,
                    'children': user.children or [],
                    'registered_at': user.registered_at.isoformat() if user.registered_at else None
                }
            })
        payment_plans = normalize_payment_plans_payload(
            get_site_setting_value('payment_plans', DEFAULT_PAYMENT_PLANS)
        )

        try:
            requested_amount = int(data.get('amount'))
            requested_training_count = int(data.get('training_count'))
        except (TypeError, ValueError):
            return jsonify({'error': 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Рµ РїР°СЂР°РјРµС‚СЂС‹ С‚Р°СЂРёС„Р°'}), 400

        requested_plan_id = str(data.get('plan_id') or '').strip()
        selected_plan = None

        if requested_plan_id:
            selected_plan = next(
                (
                    plan for plan in payment_plans
                    if str(plan.get('id') or '').strip() == requested_plan_id
                ),
                None,
            )
        else:
            selected_plan = next(
                (
                    plan for plan in payment_plans
                    if plan.get('price') == requested_amount
                    and plan.get('trainings') == requested_training_count
                ),
                None,
            )

        if not selected_plan:
            return jsonify({'error': 'Р’С‹Р±СЂР°РЅРЅС‹Р№ С‚Р°СЂРёС„ РЅРµ РЅР°Р№РґРµРЅ. РћР±РЅРѕРІРёС‚Рµ СЃС‚СЂР°РЅРёС†Сѓ Рё РїРѕРїСЂРѕР±СѓР№С‚Рµ СЃРЅРѕРІР°'}), 400

        if (
            selected_plan.get('price') != requested_amount
            or selected_plan.get('trainings') != requested_training_count
        ):
            return jsonify({'error': 'РўР°СЂРёС„ Р±С‹Р» РёР·РјРµРЅС‘РЅ. РћР±РЅРѕРІРёС‚Рµ СЃС‚СЂР°РЅРёС†Сѓ Рё РїРѕРїСЂРѕР±СѓР№С‚Рµ СЃРЅРѕРІР°'}), 400

        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ'}), 404

        data = request.get_json() or {}

        if 'name' in data:
            user.name = data['name']
        if 'phone' in data:
            user.phone = data['phone']
        if 'email' in data:
            user.email = data['email']
        if 'children' in data:
            user.children = normalize_children_payload(data['children'], user.id)

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'РџСЂРѕС„РёР»СЊ РѕР±РЅРѕРІР»РµРЅ',
            'user': {
                'id': user.id,
                'name': user.name,
                'email': user.email,
                'phone': user.phone,
                'children': user.children or [],
                'registered_at': user.registered_at.isoformat() if user.registered_at else None
            }
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"вќЊ РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ РїСЂРѕС„РёР»СЏ: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ РїСЂРѕС„РёР»СЏ'}), 500

@bp.route('/api/branches/by-birth-year', methods=['GET'])
@login_required
def get_branches_by_birth_year_api():
    """РџРѕР»СѓС‡РµРЅРёРµ С„РёР»РёР°Р»РѕРІ РїРѕ РіРѕРґСѓ СЂРѕР¶РґРµРЅРёСЏ СЂРµР±РµРЅРєР°"""
    try:
        birth_year = request.args.get('birth_year', type=int)
        
        if not birth_year:
            return jsonify({'error': 'РќРµ СѓРєР°Р·Р°РЅ РіРѕРґ СЂРѕР¶РґРµРЅРёСЏ'}), 400
        
        logger.info(f"рџ”Ќ Р—Р°РїСЂРѕСЃ С„РёР»РёР°Р»РѕРІ РґР»СЏ РіРѕРґР° СЂРѕР¶РґРµРЅРёСЏ: {birth_year}")
        
        # РћРїСЂРµРґРµР»СЏРµРј РІРѕР·СЂР°СЃС‚РЅСѓСЋ РіСЂСѓРїРїСѓ
        normalized_birth_year = normalize_birth_year(birth_year)
        if not normalized_birth_year:
            return jsonify({'error': 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РіРѕРґ СЂРѕР¶РґРµРЅРёСЏ'}), 400
        age_group = str(normalized_birth_year)
        logger.info(f"рџ“Љ РћРїСЂРµРґРµР»РµРЅР° РІРѕР·СЂР°СЃС‚РЅР°СЏ РіСЂСѓРїРїР°: {age_group} РґР»СЏ {birth_year} РіРѕРґР°")
        
        # РќР°С…РѕРґРёРј СЂР°СЃРїРёСЃР°РЅРёСЏ РґР»СЏ СЌС‚РѕР№ РІРѕР·СЂР°СЃС‚РЅРѕР№ РіСЂСѓРїРїС‹
        schedules = filter_schedules_by_birth_year(
            AgeSchedule.query.filter_by(
                is_active=True
            ).all(),
            normalized_birth_year,
        )
        
        logger.info(f"рџ“… РќР°Р№РґРµРЅРѕ {len(schedules)} СЂР°СЃРїРёСЃР°РЅРёР№ РґР»СЏ РіСЂСѓРїРїС‹ {age_group}")
        
        if not schedules:
            return jsonify({
                'success': True,
                'message': 'РќРµС‚ РґРѕСЃС‚СѓРїРЅС‹С… СЂР°СЃРїРёСЃР°РЅРёР№ РґР»СЏ СЌС‚РѕР№ РІРѕР·СЂР°СЃС‚РЅРѕР№ РіСЂСѓРїРїС‹',
                'branches': [],
                'schedules': []
            })
        
        # РџРѕР»СѓС‡Р°РµРј СѓРЅРёРєР°Р»СЊРЅС‹Рµ С„РёР»РёР°Р»С‹ РёР· СЂР°СЃРїРёСЃР°РЅРёР№
        branch_ids = {schedule.branch_id for schedule in schedules}
        logger.info(f"рџЏў РЈРЅРёРєР°Р»СЊРЅС‹Рµ С„РёР»РёР°Р»С‹: {branch_ids}")
        
        # РџРѕР»СѓС‡Р°РµРј РёРЅС„РѕСЂРјР°С†РёСЋ Рѕ С„РёР»РёР°Р»Р°С…
        branches = Branch.query.filter(
            Branch.id.in_(branch_ids),
            Branch.is_active == True
        ).all()
        
        logger.info(f"вњ… РќР°Р№РґРµРЅРѕ {len(branches)} Р°РєС‚РёРІРЅС‹С… С„РёР»РёР°Р»РѕРІ")
        
        branches_data = []
        for branch in branches:
            # РџРѕР»СѓС‡Р°РµРј СЂР°СЃРїРёСЃР°РЅРёСЏ РґР»СЏ СЌС‚РѕРіРѕ С„РёР»РёР°Р»Р°
            branch_schedules = [s for s in schedules if s.branch_id == branch.id]
            
            schedules_data = []
            for schedule in branch_schedules:
                # РџРѕР»СѓС‡Р°РµРј РґРЅРё РЅРµРґРµР»Рё (С‚РµРїРµСЂСЊ СЌС‚Рѕ СЃРїРёСЃРѕРє)
                days_list = schedule.days_of_week
                if isinstance(days_list, str):
                    try:
                        days_list = json.loads(days_list)
                    except:
                        days_list = []
                elif days_list is None:
                    days_list = []
                
                # РџСЂРµРѕР±СЂР°Р·СѓРµРј РґРЅРё РІ С‡РёС‚Р°РµРјС‹Р№ С„РѕСЂРјР°С‚
                days_map = ['РџРЅ', 'Р’С‚', 'РЎСЂ', 'Р§С‚', 'РџС‚', 'РЎР±', 'Р’СЃ']
                schedule_days = []
                for day_num in days_list:
                    if 0 <= day_num < len(days_map):
                        schedule_days.append({
                            'number': day_num,
                            'name': days_map[day_num]
                        })
                
                schedules_data.append({
                    'id': schedule.id,
                    'age_group': schedule.age_group,
                    'days': schedule_days,  # РўРµРїРµСЂСЊ СЌС‚Рѕ СЃРїРёСЃРѕРє РґРЅРµР№
                    'days_display': ', '.join([day['name'] for day in schedule_days]),
                    'time': schedule.time,
                    'capacity': schedule.capacity,
                    'instructor': schedule.instructor or '',
                    'is_active': schedule.is_active
                })
            
            branches_data.append({
                'id': branch.id,
                'name': branch.name,
                'address': branch.address,
                'phone': branch.phone,
                'email': branch.email,
                'schedules': schedules_data
            })
        
        return jsonify({
            'success': True,
            'age_group': age_group,
            'branches': branches_data
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ С„РёР»РёР°Р»РѕРІ: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РґР°РЅРЅС‹С…'}), 500

@bp.route('/api/branches/with-schedule', methods=['GET'])
@login_required
def get_branches_with_schedule_api():
    """РџРѕР»СѓС‡РµРЅРёРµ С„РёР»РёР°Р»РѕРІ СЃ СЂР°СЃРїРёСЃР°РЅРёРµРј"""
    try:
        branches = Branch.query.filter_by(is_active=True).all()
        
        branches_data = []
        for branch in branches:
            # РџРѕР»СѓС‡Р°РµРј СЂР°СЃРїРёСЃР°РЅРёСЏ РґР»СЏ С„РёР»РёР°Р»Р°
            schedules = AgeSchedule.query.filter_by(
                branch_id=branch.id,
                is_active=True
            ).all()
            
            schedules_data = []
            for schedule in schedules:
                # РџРѕР»СѓС‡Р°РµРј РґРЅРё РЅРµРґРµР»Рё
                days_list = schedule.days_of_week
                if isinstance(days_list, str):
                    try:
                        days_list = json.loads(days_list)
                    except:
                        days_list = []
                elif days_list is None:
                    days_list = []
                
                # РџСЂРµРѕР±СЂР°Р·СѓРµРј РґРЅРё РІ С‡РёС‚Р°РµРјС‹Р№ С„РѕСЂРјР°С‚
                days_map = ['РџРЅ', 'Р’С‚', 'РЎСЂ', 'Р§С‚', 'РџС‚', 'РЎР±', 'Р’СЃ']
                schedule_days = []
                for day_num in days_list:
                    if 0 <= day_num < len(days_map):
                        schedule_days.append({
                            'number': day_num,
                            'name': days_map[day_num]
                        })
                
                schedules_data.append({
                    'id': schedule.id,
                    'age_group': schedule.age_group,
                    'days': schedule_days,
                    'days_display': ', '.join([day['name'] for day in schedule_days]),
                    'time': schedule.time,
                    'capacity': schedule.capacity,
                    'instructor': schedule.instructor or ''
                })
            
            # Р“СЂСѓРїРїРёСЂСѓРµРј СЂР°СЃРїРёСЃР°РЅРёСЏ РїРѕ РІРѕР·СЂР°СЃС‚РЅС‹Рј РіСЂСѓРїРїР°Рј
            age_groups = {}
            for schedule in schedules_data:
                if schedule['age_group'] not in age_groups:
                    age_groups[schedule['age_group']] = []
                age_groups[schedule['age_group']].append(schedule)
            
            branches_data.append({
                'id': branch.id,
                'name': branch.name,
                'address': branch.address,
                'phone': branch.phone,
                'email': branch.email,
                'schedules': schedules_data,
                'age_groups': age_groups
            })
        
        return jsonify({
            'success': True,
            'branches': branches_data
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ С„РёР»РёР°Р»РѕРІ: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РґР°РЅРЅС‹С…'}), 500

@bp.route('/api/schedule/branch/<int:branch_id>/age-group/<age_group>', methods=['GET'])
@login_required
def get_schedule_by_branch_and_age_group(branch_id, age_group):
    """РџРѕР»СѓС‡РµРЅРёРµ СЂР°СЃРїРёСЃР°РЅРёСЏ РґР»СЏ С„РёР»РёР°Р»Р° Рё РІРѕР·СЂР°СЃС‚РЅРѕР№ РіСЂСѓРїРїС‹"""
    try:
        schedules = AgeSchedule.query.filter_by(
            branch_id=branch_id,
            age_group=age_group,
            is_active=True
        ).all()
        
        schedules_data = []
        for schedule in schedules:
            # РџРѕР»СѓС‡Р°РµРј РґРЅРё РЅРµРґРµР»Рё
            days_list = schedule.days_of_week
            if isinstance(days_list, str):
                try:
                    days_list = json.loads(days_list)
                except:
                    days_list = []
            elif days_list is None:
                days_list = []
            
            # РџСЂРµРѕР±СЂР°Р·СѓРµРј РґРЅРё РІ С‡РёС‚Р°РµРјС‹Р№ С„РѕСЂРјР°С‚
            days_map = ['РџРЅ', 'Р’С‚', 'РЎСЂ', 'Р§С‚', 'РџС‚', 'РЎР±', 'Р’СЃ']
            schedule_days = []
            for day_num in days_list:
                if 0 <= day_num < len(days_map):
                    schedule_days.append({
                        'number': day_num,
                        'name': days_map[day_num]
                    })
            
            schedules_data.append({
                'id': schedule.id,
                'age_group': schedule.age_group,
                'days': schedule_days,
                'days_display': ', '.join([day['name'] for day in schedule_days]),
                'time': schedule.time,
                'capacity': schedule.capacity,
                'instructor': schedule.instructor or '',
                'is_active': schedule.is_active
            })
        
        return jsonify({
            'success': True,
            'schedules': schedules_data
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ СЂР°СЃРїРёСЃР°РЅРёСЏ: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РґР°РЅРЅС‹С…'}), 500

# ========== РџРћРЎР•Р©Р•РќРРЇ Р РћРџР›РђРўР« ==========

@bp.route('/api/attendance', methods=['GET'])
@login_required
def get_user_attendance():
    """РџРѕР»СѓС‡РµРЅРёРµ РїРѕСЃРµС‰РµРЅРёР№ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ"""
    try:
        user_id = request.user_id
        
        attendance = Attendance.query.filter_by(user_id=user_id).order_by(Attendance.scheduled_date.desc()).all()
        
        attendance_data = []
        for record in attendance:
            branch = Branch.query.get(record.branch_id) if record.branch_id else None
            attendance_data.append({
                'id': record.id,
                'child_id': record.child_id,
                'branch_id': record.branch_id,
                'branch_name': branch.name if branch else 'РќРµ СѓРєР°Р·Р°РЅ',
                'scheduled_date': record.scheduled_date.isoformat() if record.scheduled_date else None,
                'actual_date': record.actual_date.isoformat() if record.actual_date else None,
                'status': record.status,
                'age_group': record.age_group,
                'is_makeup': record.is_makeup,
                'notes': record.notes,
                'created_at': record.created_at.isoformat() if record.created_at else None
            })
        
        return jsonify({
            'success': True,
            'attendance': attendance_data
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РїРѕСЃРµС‰РµРЅРёР№: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РїРѕСЃРµС‰РµРЅРёР№'}), 500

@bp.route('/api/attendance/user', methods=['GET'])
@login_required
def get_user_attendance_v2():
    """РџРѕР»СѓС‡РµРЅРёРµ РїРѕСЃРµС‰РµРЅРёР№ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ (Р°Р»СЊС‚РµСЂРЅР°С‚РёРІРЅС‹Р№ СЌРЅРґРїРѕРёРЅС‚)"""
    try:
        user_id = request.user_id
        
        attendance = Attendance.query.filter_by(user_id=user_id).order_by(Attendance.scheduled_date.desc()).all()
        
        attendance_data = []
        for record in attendance:
            branch = Branch.query.get(record.branch_id) if record.branch_id else None
            
            # РџРѕР»СѓС‡Р°РµРј РёРјСЏ СЂРµР±РµРЅРєР°
            user = User.query.get(user_id)
            child_name = "РќРµРёР·РІРµСЃС‚РЅРѕ"
            if user and user.children:
                for child in user.children:
                    if child.get('id') == record.child_id:
                        child_name = child.get('name', 'РќРµРёР·РІРµСЃС‚РЅРѕ')
                        break
            
            attendance_data.append({
                'id': record.id,
                'child_id': record.child_id,
                'child_name': child_name,
                'branch_id': record.branch_id,
                'branch_name': branch.name if branch else 'РќРµ СѓРєР°Р·Р°РЅ',
                'scheduled_date': record.scheduled_date.isoformat() if record.scheduled_date else None,
                'actual_date': record.actual_date.isoformat() if record.actual_date else None,
                'status': record.status,
                'age_group': record.age_group,
                'is_makeup': record.is_makeup,
                'notes': record.notes,
                'created_at': record.created_at.isoformat() if record.created_at else None
            })
        
        return jsonify({
            'success': True,
            'attendance': attendance_data
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РїРѕСЃРµС‰РµРЅРёР№: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РїРѕСЃРµС‰РµРЅРёР№'}), 500

@bp.route('/api/payments', methods=['GET'])
@login_required
def get_user_payments():
    """РџРѕР»СѓС‡РµРЅРёРµ РїР»Р°С‚РµР¶РµР№ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ"""
    try:
        user_id = request.user_id
        
        payments = Payment.query.filter_by(user_id=user_id).order_by(Payment.created_at.desc()).all()
        
        payments_data = []
        for payment in payments:
            branch = Branch.query.get(payment.branch_id) if payment.branch_id else None
            payments_data.append({
                'id': payment.id,
                'child_id': payment.child_id,
                'branch_id': payment.branch_id,
                'branch_name': branch.name if branch else 'РќРµ СѓРєР°Р·Р°РЅ',
                'amount': payment.amount,
                'training_count': payment.training_count,
                'used_trainings': payment.used_trainings,
                'remaining_trainings': payment.remaining_trainings,
                'start_date': payment.start_date.isoformat() if payment.start_date else None,
                'end_date': payment.end_date.isoformat() if payment.end_date else None,
                'status': payment.status,
                'payment_method': payment.payment_method,
                'transaction_id': payment.transaction_id,
                'created_at': payment.created_at.isoformat() if payment.created_at else None
            })
        
        return jsonify({
            'success': True,
            'payments': payments_data
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РїР»Р°С‚РµР¶РµР№: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РїР»Р°С‚РµР¶РµР№'}), 500

@bp.route('/api/payments/user', methods=['GET'])
@login_required
def get_user_payments_v2():
    """РџРѕР»СѓС‡РµРЅРёРµ РїР»Р°С‚РµР¶РµР№ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ (Р°Р»СЊС‚РµСЂРЅР°С‚РёРІРЅС‹Р№ СЌРЅРґРїРѕРёРЅС‚)"""
    try:
        user_id = request.user_id
        
        payments = Payment.query.filter_by(user_id=user_id).order_by(Payment.created_at.desc()).all()
        
        payments_data = []
        for payment in payments:
            branch = Branch.query.get(payment.branch_id) if payment.branch_id else None
            
            # РџРѕР»СѓС‡Р°РµРј РёРјСЏ СЂРµР±РµРЅРєР°
            user = User.query.get(user_id)
            child_name = "РќРµРёР·РІРµСЃС‚РЅРѕ"
            if user and user.children:
                for child in user.children:
                    if child.get('id') == payment.child_id:
                        child_name = child.get('name', 'РќРµРёР·РІРµСЃС‚РЅРѕ')
                        break
            
            payments_data.append({
                'id': payment.id,
                'child_id': payment.child_id,
                'child_name': child_name,
                'branch_id': payment.branch_id,
                'branch_name': branch.name if branch else 'РќРµ СѓРєР°Р·Р°РЅ',
                'amount': payment.amount,
                'training_count': payment.training_count,
                'used_trainings': payment.used_trainings,
                'remaining_trainings': payment.remaining_trainings,
                'start_date': payment.start_date.isoformat() if payment.start_date else None,
                'end_date': payment.end_date.isoformat() if payment.end_date else None,
                'status': payment.status,
                'payment_method': payment.payment_method,
                'transaction_id': payment.transaction_id,
                'created_at': payment.created_at.isoformat() if payment.created_at else None
            })
        
        return jsonify({
            'success': True,
            'payments': payments_data
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РїР»Р°С‚РµР¶РµР№: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РїР»Р°С‚РµР¶РµР№'}), 500

@bp.route('/api/payments', methods=['POST'])
@login_required
def create_payment():
    """РЎРѕР·РґР°РЅРёРµ РЅРѕРІРѕРіРѕ РїР»Р°С‚РµР¶Р° (СЃРѕ СЃС‚Р°С‚СѓСЃРѕРј 'pending')"""
    try:
        user_id = request.user_id
        data = request.get_json() or {}
        
        logger.info(f"рџ“Ґ РџРѕР»СѓС‡РµРЅ Р·Р°РїСЂРѕСЃ РЅР° СЃРѕР·РґР°РЅРёРµ РїР»Р°С‚РµР¶Р° РѕС‚ user_id={user_id}: {data}")
        
        # РџСЂРѕРІРµСЂСЏРµРј РѕР±СЏР·Р°С‚РµР»СЊРЅС‹Рµ РїРѕР»СЏ
        required_fields = ['child_id', 'amount', 'training_count', 'birth_year']
        payment_plans = normalize_payment_plans_payload(
            get_site_setting_value('payment_plans', DEFAULT_PAYMENT_PLANS)
        )

        try:
            requested_amount = int(data.get('amount'))
            requested_training_count = int(data.get('training_count'))
        except (TypeError, ValueError):
            return jsonify({'error': 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Рµ РїР°СЂР°РјРµС‚СЂС‹ С‚Р°СЂРёС„Р°'}), 400

        requested_plan_id = str(data.get('plan_id') or '').strip()
        selected_plan = None

        if requested_plan_id:
            selected_plan = next(
                (
                    plan for plan in payment_plans
                    if str(plan.get('id') or '').strip() == requested_plan_id
                ),
                None,
            )
        else:
            selected_plan = next(
                (
                    plan for plan in payment_plans
                    if plan.get('price') == requested_amount
                    and plan.get('trainings') == requested_training_count
                ),
                None,
            )

        if not selected_plan:
            return jsonify({'error': 'Р’С‹Р±СЂР°РЅРЅС‹Р№ С‚Р°СЂРёС„ РЅРµ РЅР°Р№РґРµРЅ. РћР±РЅРѕРІРёС‚Рµ СЃС‚СЂР°РЅРёС†Сѓ Рё РїРѕРїСЂРѕР±СѓР№С‚Рµ СЃРЅРѕРІР°'}), 400

        if (
            selected_plan.get('price') != requested_amount
            or selected_plan.get('trainings') != requested_training_count
        ):
            return jsonify({'error': 'РўР°СЂРёС„ Р±С‹Р» РёР·РјРµРЅС‘РЅ. РћР±РЅРѕРІРёС‚Рµ СЃС‚СЂР°РЅРёС†Сѓ Рё РїРѕРїСЂРѕР±СѓР№С‚Рµ СЃРЅРѕРІР°'}), 400
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'РћС‚СЃСѓС‚СЃС‚РІСѓРµС‚ РѕР±СЏР·Р°С‚РµР»СЊРЅРѕРµ РїРѕР»Рµ: {field}'}), 400
        
        # РџРѕР»СѓС‡Р°РµРј РёРЅС„РѕСЂРјР°С†РёСЋ Рѕ СЂРµР±РµРЅРєРµ
        user = User.query.get(user_id)
        child_info = None
        child_name = data.get('child_name', 'РќРµРёР·РІРµСЃС‚РЅРѕ')
        
        if user and user.children:
            for child in user.children:
                if child.get('id') == data['child_id']:
                    child_info = child
                    child_name = child.get('name', 'РќРµРёР·РІРµСЃС‚РЅРѕ')
                    break
        
        if not child_info:
            return jsonify({'error': 'Р РµР±РµРЅРѕРє РЅРµ РЅР°Р№РґРµРЅ Сѓ РґР°РЅРЅРѕРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ'}), 400
        
        # РћРїСЂРµРґРµР»СЏРµРј РІРѕР·СЂР°СЃС‚РЅСѓСЋ РіСЂСѓРїРїСѓ РїРѕ РіРѕРґСѓ СЂРѕР¶РґРµРЅРёСЏ
        birth_year = data['birth_year']
        normalized_birth_year = normalize_birth_year(birth_year)
        if not normalized_birth_year:
            return jsonify({'error': 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РіРѕРґ СЂРѕР¶РґРµРЅРёСЏ'}), 400
        age_group = str(normalized_birth_year)
        
        # РќР°С…РѕРґРёРј СЂР°СЃРїРёСЃР°РЅРёРµ РґР»СЏ С„РёР»РёР°Р»Р° Рё РІРѕР·СЂР°СЃС‚РЅРѕР№ РіСЂСѓРїРїС‹
        branch_id = data.get('branch_id')
        if not branch_id:
            return jsonify({'error': 'РќРµ СѓРєР°Р·Р°РЅ С„РёР»РёР°Р»'}), 400
        
        schedules = filter_schedules_by_birth_year(
            AgeSchedule.query.filter_by(
                branch_id=branch_id,
                is_active=True
            ).all(),
            normalized_birth_year,
        )
        schedule = schedules[0] if schedules else None
        
        if not schedule:
            return jsonify({'error': f'РќРµС‚ СЂР°СЃРїРёСЃР°РЅРёСЏ РґР»СЏ С„РёР»РёР°Р»Р° {branch_id} Рё РІРѕР·СЂР°СЃС‚РЅРѕР№ РіСЂСѓРїРїС‹ {age_group}'}), 400
        
        # РЎРѕР·РґР°РµРј РїР»Р°С‚РµР¶ СЃРѕ СЃС‚Р°С‚СѓСЃРѕРј 'pending'
        payment = Payment(
            user_id=user_id,
            child_id=data['child_id'],
            branch_id=branch_id,
            amount=selected_plan['price'],
            training_count=selected_plan['trainings'],
            remaining_trainings=selected_plan['trainings'],  # Р’СЃРµ С‚СЂРµРЅРёСЂРѕРІРєРё РµС‰Рµ РґРѕСЃС‚СѓРїРЅС‹
            start_date=datetime.utcnow(),
            end_date=datetime.utcnow() + timedelta(days=30),  # РњРµСЃСЏС† РґРµР№СЃС‚РІРёСЏ
            status='pending',  # вљЎ РР—РњР•РќР•РќРћ: С‚РµРїРµСЂСЊ 'pending' РІРјРµСЃС‚Рѕ 'confirmed'
            payment_method=data.get('payment_method', 'card'),
            transaction_id=data.get('transaction_id', f'trans-{datetime.utcnow().timestamp()}')
        )
        
        db.session.add(payment)
        db.session.commit()  # РЎРѕС…СЂР°РЅСЏРµРј РїР»Р°С‚РµР¶ СЃСЂР°Р·Сѓ
        
        logger.info(f"вњ… РЎРѕР·РґР°РЅ РїР»Р°С‚РµР¶ ID={payment.id}, amount={payment.amount}, status=pending")
        
        return jsonify({
            'success': True,
            'message': 'РџР»Р°С‚РµР¶ СЃРѕР·РґР°РЅ Рё РѕР¶РёРґР°РµС‚ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРј',
            'payment': {
                'id': payment.id,
                'amount': payment.amount,
                'training_count': payment.training_count,
                'used_trainings': 0,
                'remaining_trainings': payment.training_count,
                'status': 'pending',  # вљЎ РР—РњР•РќР•РќРћ
                'created_at': payment.created_at.isoformat() if payment.created_at else None
            }
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"вќЊ РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ РїР»Р°С‚РµР¶Р°: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': f'РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ РїР»Р°С‚РµР¶Р°: {str(e)}'}), 500

@bp.record_once
def _override_payment_endpoints(setup_state):
    setup_state.app.view_functions[f'{bp.name}.create_payment'] = create_payment_real
    setup_state.app.view_functions[f'{bp.name}.get_user_payments'] = get_user_payments_real
    setup_state.app.view_functions[f'{bp.name}.get_user_payments_v2'] = get_user_payments_real


@bp.route('/api/payments/active', methods=['GET'])
@login_required
def get_active_payments():
    """РџРѕР»СѓС‡РµРЅРёРµ Р°РєС‚РёРІРЅС‹С… РїР»Р°С‚РµР¶РµР№ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ (С‚РѕР»СЊРєРѕ РїРѕРґС‚РІРµСЂР¶РґРµРЅРЅС‹Рµ)"""
    try:
        user_id = request.user_id
        
        # РќР°С…РѕРґРёРј Р°РєС‚РёРІРЅС‹Рµ РїР»Р°С‚РµР¶Рё (РїРѕРґС‚РІРµСЂР¶РґРµРЅРЅС‹Рµ, СЃ РѕСЃС‚Р°РІС€РёРјРёСЃСЏ С‚СЂРµРЅРёСЂРѕРІРєР°РјРё)
        now = datetime.utcnow()
        payments = Payment.query.filter(
            Payment.user_id == user_id,
            Payment.remaining_trainings > 0,
            Payment.end_date > now,
            Payment.status == 'confirmed'  # вљЎ РўРѕР»СЊРєРѕ РїРѕРґС‚РІРµСЂР¶РґРµРЅРЅС‹Рµ
        ).order_by(Payment.end_date).all()
        
        payments_data = []
        for payment in payments:
            branch = Branch.query.get(payment.branch_id) if payment.branch_id else None
            
            # РџРѕР»СѓС‡Р°РµРј РёРЅС„РѕСЂРјР°С†РёСЋ Рѕ СЂРµР±РµРЅРєРµ
            user = User.query.get(user_id)
            child_name = "РќРµРёР·РІРµСЃС‚РЅРѕ"
            if user and user.children:
                for child in user.children:
                    if child.get('id') == payment.child_id:
                        child_name = child.get('name', 'РќРµРёР·РІРµСЃС‚РЅРѕ')
                        break
            
            payments_data.append({
                'id': payment.id,
                'child_id': payment.child_id,
                'child_name': child_name,
                'branch_id': payment.branch_id,
                'branch_name': branch.name if branch else 'РќРµ СѓРєР°Р·Р°РЅ',
                'amount': payment.amount,
                'training_count': payment.training_count,
                'used_trainings': payment.used_trainings,
                'remaining_trainings': payment.remaining_trainings,
                'start_date': payment.start_date.isoformat() if payment.start_date else None,
                'end_date': payment.end_date.isoformat() if payment.end_date else None,
                'status': payment.status,
                'days_remaining': (payment.end_date - now).days
            })
        
        return jsonify({
            'success': True,
            'payments': payments_data
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ Р°РєС‚РёРІРЅС‹С… РїР»Р°С‚РµР¶РµР№: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РїР»Р°С‚РµР¶РµР№'}), 500
    
@bp.route('/api/attendance/available-reschedule-dates', methods=['GET'])
@login_required
def get_available_reschedule_dates():
    """РџРѕР»СѓС‡РµРЅРёРµ РґРѕСЃС‚СѓРїРЅС‹С… РґР°С‚ РґР»СЏ РїРµСЂРµРЅРѕСЃР° С‚СЂРµРЅРёСЂРѕРІРєРё"""
    try:
        user_id = request.user_id
        child_id = request.args.get('child_id')
        
        if not child_id:
            return jsonify({'error': 'РќРµ СѓРєР°Р·Р°РЅ ID СЂРµР±РµРЅРєР°'}), 400
        
        # РџСЂРµРѕР±СЂР°Р·СѓРµРј child_id РІ int
        try:
            child_id_int = int(child_id)
        except ValueError:
            return jsonify({'error': 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ ID СЂРµР±РµРЅРєР°'}), 400
        
        # РџСЂРѕРІРµСЂСЏРµРј, С‡С‚Рѕ СЂРµР±РµРЅРѕРє РїСЂРёРЅР°РґР»РµР¶РёС‚ РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ
        user = User.query.get(user_id)
        child_exists = False
        child_info = None
        
        if user and user.children:
            children = user.children
            if isinstance(children, str):
                try:
                    children = json.loads(children)
                except:
                    children = []
            
            for child in children:
                child_id_from_list = child.get('id')
                # РџСЂРµРѕР±СЂР°Р·СѓРµРј ID СЂРµР±РµРЅРєР° РІ int РґР»СЏ СЃСЂР°РІРЅРµРЅРёСЏ
                try:
                    if isinstance(child_id_from_list, str) and child_id_from_list.startswith('temp_'):
                        continue
                    child_id_num = int(child_id_from_list) if child_id_from_list else None
                except (ValueError, TypeError):
                    child_id_num = None
                
                if child_id_num == child_id_int:
                    child_exists = True
                    child_info = child
                    break
        
        if not child_exists:
            logger.warning(f"вљ пёЏ Р РµР±РµРЅРѕРє {child_id_int} РЅРµ РЅР°Р№РґРµРЅ Сѓ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ {user_id}")
            return jsonify({'error': 'Р РµР±РµРЅРѕРє РЅРµ РЅР°Р№РґРµРЅ'}), 404
        
        # РџРѕР»СѓС‡Р°РµРј Р°РєС‚РёРІРЅС‹Р№ РїР»Р°С‚РµР¶ РґР»СЏ СЂРµР±РµРЅРєР°
        now = datetime.utcnow()
        active_payment = Payment.query.filter(
            Payment.user_id == user_id,
            Payment.child_id == child_id_int,
            Payment.remaining_trainings > 0,
            Payment.end_date > now,
            Payment.status == 'confirmed'
        ).first()
        
        if not active_payment:
            logger.info(f"в„№пёЏ РќРµС‚ Р°РєС‚РёРІРЅРѕР№ РѕРїР»Р°С‚С‹ РґР»СЏ СЂРµР±РµРЅРєР° {child_id_int}")
            return jsonify({
                'success': True,
                'available_dates': [],
                'message': 'РќРµС‚ Р°РєС‚РёРІРЅРѕР№ РѕРїР»Р°С‚С‹ РґР»СЏ РїРµСЂРµРЅРѕСЃР°'
            })
        
        # РџРѕР»СѓС‡Р°РµРј РІРѕР·СЂР°СЃС‚РЅСѓСЋ РіСЂСѓРїРїСѓ СЂРµР±РµРЅРєР°
        birth_year = child_info.get('birth_year')
        if not birth_year:
            return jsonify({'error': 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕРїСЂРµРґРµР»РёС‚СЊ РІРѕР·СЂР°СЃС‚РЅСѓСЋ РіСЂСѓРїРїСѓ: РіРѕРґ СЂРѕР¶РґРµРЅРёСЏ РЅРµ СѓРєР°Р·Р°РЅ'}), 400
        
        try:
            birth_year_int = normalize_birth_year(birth_year)
        except ValueError:
            return jsonify({'error': 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РіРѕРґ СЂРѕР¶РґРµРЅРёСЏ'}), 400
        
        age_group = str(birth_year_int)
        
        if not age_group:
            return jsonify({'error': f'РќРµ СѓРґР°Р»РѕСЃСЊ РѕРїСЂРµРґРµР»РёС‚СЊ РІРѕР·СЂР°СЃС‚РЅСѓСЋ РіСЂСѓРїРїСѓ РґР»СЏ РіРѕРґР° СЂРѕР¶РґРµРЅРёСЏ {birth_year_int}'}), 400
        
        # РџРѕР»СѓС‡Р°РµРј СЂР°СЃРїРёСЃР°РЅРёРµ РґР»СЏ РІРѕР·СЂР°СЃС‚РЅРѕР№ РіСЂСѓРїРїС‹ Рё С„РёР»РёР°Р»Р°
        schedules = filter_schedules_by_birth_year(
            AgeSchedule.query.filter_by(
                branch_id=active_payment.branch_id,
                is_active=True
            ).all(),
            birth_year_int,
        )
        
        if not schedules:
            logger.info(f"в„№пёЏ РќРµС‚ СЂР°СЃРїРёСЃР°РЅРёСЏ РґР»СЏ РіСЂСѓРїРїС‹ {age_group}, С„РёР»РёР°Р» {active_payment.branch_id}")
            return jsonify({
                'success': True,
                'available_dates': [],
                'message': 'РќРµС‚ РґРѕСЃС‚СѓРїРЅРѕРіРѕ СЂР°СЃРїРёСЃР°РЅРёСЏ РґР»СЏ РІРѕР·СЂР°СЃС‚РЅРѕР№ РіСЂСѓРїРїС‹'
            })
        
        # РћРїСЂРµРґРµР»СЏРµРј РїРµСЂРёРѕРґ РґР»СЏ РїРѕРёСЃРєР° РґР°С‚ (Р±Р»РёР¶Р°Р№С€РёРµ 30 РґРЅРµР№)
        start_date = datetime.utcnow()
        end_date = start_date + timedelta(days=30)
        
        available_dates = []
        
        # Р”Р»СЏ РєР°Р¶РґРѕРіРѕ СЂР°СЃРїРёСЃР°РЅРёСЏ РїРѕР»СѓС‡Р°РµРј РґРЅРё РЅРµРґРµР»Рё
        for schedule in schedules:
            days_list = schedule.days_of_week
            if isinstance(days_list, str):
                try:
                    days_list = json.loads(days_list)
                except:
                    days_list = []
            elif days_list is None:
                days_list = []
            
            # Р“РµРЅРµСЂРёСЂСѓРµРј РґР°С‚С‹ РґР»СЏ РєР°Р¶РґРѕРіРѕ РґРЅСЏ РЅРµРґРµР»Рё РІ СЂР°СЃРїРёСЃР°РЅРёРё
            current_date = start_date
            while current_date <= end_date:
                if current_date.weekday() in days_list:
                    # РЎРѕР·РґР°РµРј datetime СЃ РІСЂРµРјРµРЅРµРј РёР· СЂР°СЃРїРёСЃР°РЅРёСЏ
                    try:
                        time_str = schedule.time
                        if ':' in time_str:
                            hours, minutes = map(int, time_str.split(':'))
                            training_datetime = datetime(
                                current_date.year, current_date.month, current_date.day,
                                hours, minutes, 0
                            )
                            
                            # РџСЂРѕРІРµСЂСЏРµРј, РЅРµ Р·Р°РЅСЏС‚Рѕ Р»Рё РІСЂРµРјСЏ
                            scheduled_count = Attendance.query.filter(
                                Attendance.schedule_id == schedule.id,
                                Attendance.scheduled_date == training_datetime,
                                Attendance.status.in_(['scheduled', 'attended'])
                            ).count()
                            
                            # РџСЂРѕРІРµСЂСЏРµРј, РЅРµ Р·Р°РїРёСЃР°РЅ Р»Рё СѓР¶Рµ СЂРµР±РµРЅРѕРє РЅР° СЌС‚Сѓ РґР°С‚Сѓ
                            child_booked = Attendance.query.filter(
                                Attendance.user_id == user_id,
                                Attendance.child_id == child_id_int,
                                Attendance.scheduled_date == training_datetime,
                                Attendance.status.in_(['scheduled', 'attended', 'rescheduled'])
                            ).first()
                            
                            # РџСЂРѕРІРµСЂСЏРµРј РµРјРєРѕСЃС‚СЊ
                            if (scheduled_count < schedule.capacity and 
                                not child_booked and 
                                training_datetime > datetime.utcnow()):
                                
                                # Р¤РѕСЂРјР°С‚РёСЂСѓРµРј РґР°С‚Сѓ РґР»СЏ РѕС‚РѕР±СЂР°Р¶РµРЅРёСЏ
                                day_names = ['РџРЅ', 'Р’С‚', 'РЎСЂ', 'Р§С‚', 'РџС‚', 'РЎР±', 'Р’СЃ']
                                day_name = day_names[current_date.weekday()] if current_date.weekday() < 7 else ''
                                
                                available_dates.append({
                                    'date': training_datetime.isoformat(),
                                    'display': f"{day_name} {current_date.strftime('%d.%m.%Y')} {schedule.time}",
                                    'day_name': day_name,
                                    'date_str': current_date.strftime('%d.%m.%Y'),
                                    'time': schedule.time,
                                    'schedule_id': schedule.id,
                                    'branch_id': schedule.branch_id,
                                    'age_group': schedule.age_group,
                                    'instructor': schedule.instructor or '',
                                    'capacity_used': scheduled_count,
                                    'capacity_total': schedule.capacity,
                                    'available_spots': schedule.capacity - scheduled_count
                                })
                    except Exception as e:
                        logger.error(f"вќЊ РћС€РёР±РєР° РѕР±СЂР°Р±РѕС‚РєРё РІСЂРµРјРµРЅРё СЂР°СЃРїРёСЃР°РЅРёСЏ: {e}")
                        continue
                
                current_date += timedelta(days=1)
        
        # РЈР±РёСЂР°РµРј РґСѓР±Р»РёРєР°С‚С‹ (РµСЃР»Рё РЅРµСЃРєРѕР»СЊРєРѕ СЂР°СЃРїРёСЃР°РЅРёР№ РЅР° РѕРґРЅРѕ РІСЂРµРјСЏ)
        unique_dates = []
        seen = set()
        for date_info in available_dates:
            key = (date_info['date'], date_info['time'], date_info['schedule_id'])
            if key not in seen:
                seen.add(key)
                unique_dates.append(date_info)
        
        # РЎРѕСЂС‚РёСЂСѓРµРј РїРѕ РґР°С‚Рµ
        unique_dates.sort(key=lambda x: x['date'])
        
        logger.info(f"вњ… РќР°Р№РґРµРЅРѕ {len(unique_dates)} РґРѕСЃС‚СѓРїРЅС‹С… РґР°С‚ РґР»СЏ РїРµСЂРµРЅРѕСЃР° РґР»СЏ СЂРµР±РµРЅРєР° {child_id_int}")
        
        return jsonify({
            'success': True,
            'available_dates': unique_dates,
            'child_id': child_id_int,
            'age_group': age_group,
            'remaining_trainings': active_payment.remaining_trainings if active_payment else 0
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РґР°С‚ РґР»СЏ РїРµСЂРµРЅРѕСЃР°: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': f'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РґРѕСЃС‚СѓРїРЅС‹С… РґР°С‚: {str(e)}'}), 500
    
@bp.route('/api/attendance/reschedule', methods=['POST'])
@login_required
def reschedule_attendance():
    """РџРµСЂРµРЅРµСЃС‚Рё С‚СЂРµРЅРёСЂРѕРІРєСѓ РЅР° РґСЂСѓРіСѓСЋ РґР°С‚Сѓ"""
    try:
        user_id = request.user_id
        data = request.get_json()
        
        required_fields = ['attendance_id', 'new_date']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'РћС‚СЃСѓС‚СЃС‚РІСѓРµС‚ РїРѕР»Рµ: {field}'}), 400
        
        # РџРѕР»СѓС‡Р°РµРј РёСЃС…РѕРґРЅСѓСЋ Р·Р°РїРёСЃСЊ
        attendance = Attendance.query.get(data['attendance_id'])
        
        if not attendance:
            return jsonify({'error': 'Р—Р°РїРёСЃСЊ Рѕ РїРѕСЃРµС‰РµРЅРёРё РЅРµ РЅР°Р№РґРµРЅР°'}), 404
        
        # РџСЂРѕРІРµСЂСЏРµРј РїСЂР°РІР°
        if attendance.user_id != user_id:
            return jsonify({'error': 'РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїСЂР°РІ'}), 403
        
        # РџСЂРѕРІРµСЂСЏРµРј, С‡С‚Рѕ СЌС‚Рѕ РїСЂРѕРїСѓС‰РµРЅРЅР°СЏ С‚СЂРµРЅРёСЂРѕРІРєР°
        if attendance.status != 'missed':
            return jsonify({'error': 'РњРѕР¶РЅРѕ РїРµСЂРµРЅРѕСЃРёС‚СЊ С‚РѕР»СЊРєРѕ РїСЂРѕРїСѓС‰РµРЅРЅС‹Рµ С‚СЂРµРЅРёСЂРѕРІРєРё'}), 400
        
        # РџР°СЂСЃРёРј РЅРѕРІСѓСЋ РґР°С‚Сѓ
        try:
            new_date = datetime.fromisoformat(data['new_date'].replace('Z', '+00:00'))
        except:
            return jsonify({'error': 'РќРµРІРµСЂРЅС‹Р№ С„РѕСЂРјР°С‚ РґР°С‚С‹'}), 400
        
        # РџСЂРѕРІРµСЂСЏРµРј, С‡С‚Рѕ РЅРѕРІР°СЏ РґР°С‚Р° РІ Р±СѓРґСѓС‰РµРј
        if new_date <= datetime.utcnow():
            return jsonify({'error': 'РќРѕРІР°СЏ РґР°С‚Р° РґРѕР»Р¶РЅР° Р±С‹С‚СЊ РІ Р±СѓРґСѓС‰РµРј'}), 400
        
        # РќР°С…РѕРґРёРј СЂР°СЃРїРёСЃР°РЅРёРµ РґР»СЏ РЅРѕРІРѕР№ РґР°С‚С‹
        schedule = AgeSchedule.query.get(attendance.schedule_id)
        if not schedule:
            return jsonify({'error': 'Р Р°СЃРїРёСЃР°РЅРёРµ РЅРµ РЅР°Р№РґРµРЅРѕ'}), 404
        
        # РџСЂРѕРІРµСЂСЏРµРј РґРЅРё РЅРµРґРµР»Рё
        schedule_days = schedule.days_of_week
        if isinstance(schedule_days, str):
            try:
                schedule_days = json.loads(schedule_days)
            except:
                schedule_days = []
        
        if new_date.weekday() not in schedule_days:
            return jsonify({'error': 'Р’С‹Р±СЂР°РЅРЅР°СЏ РґР°С‚Р° РЅРµ СЃРѕРѕС‚РІРµС‚СЃС‚РІСѓРµС‚ СЂР°СЃРїРёСЃР°РЅРёСЋ С„РёР»РёР°Р»Р°'}), 400
        
        # РџСЂРѕРІРµСЂСЏРµРј РµРјРєРѕСЃС‚СЊ
        scheduled_count = Attendance.query.filter(
            Attendance.schedule_id == schedule.id,
            Attendance.scheduled_date == new_date,
            Attendance.status.in_(['scheduled', 'attended'])
        ).count()
        
        if scheduled_count >= schedule.capacity:
            return jsonify({'error': 'РќР° СЌС‚Рѕ РІСЂРµРјСЏ РЅРµС‚ СЃРІРѕР±РѕРґРЅС‹С… РјРµСЃС‚'}), 400
        
        # РџСЂРѕРІРµСЂСЏРµРј, РЅРµ Р·Р°РїРёСЃР°РЅ Р»Рё СѓР¶Рµ СЂРµР±РµРЅРѕРє РЅР° СЌС‚Сѓ РґР°С‚Сѓ
        existing_attendance = Attendance.query.filter(
            Attendance.user_id == user_id,
            Attendance.child_id == attendance.child_id,
            Attendance.scheduled_date == new_date,
            Attendance.status.in_(['scheduled', 'attended', 'rescheduled'])
        ).first()
        
        if existing_attendance:
            return jsonify({'error': 'Р РµР±РµРЅРѕРє СѓР¶Рµ Р·Р°РїРёСЃР°РЅ РЅР° СЌС‚Сѓ РґР°С‚Сѓ'}), 400
        
        # РЎРѕР·РґР°РµРј РЅРѕРІСѓСЋ Р·Р°РїРёСЃСЊ РґР»СЏ РїРµСЂРµРЅРµСЃРµРЅРЅРѕР№ С‚СЂРµРЅРёСЂРѕРІРєРё
        new_attendance = Attendance(
            user_id=user_id,
            child_id=attendance.child_id,
            payment_id=attendance.payment_id,
            schedule_id=schedule.id,
            scheduled_date=new_date,
            age_group=attendance.age_group,
            branch_id=attendance.branch_id,
            status='rescheduled',
            notes=f"РџРµСЂРµРЅРѕСЃ РїСЂРѕРїСѓС‰РµРЅРЅРѕР№ С‚СЂРµРЅРёСЂРѕРІРєРё РѕС‚ {attendance.scheduled_date.date() if attendance.scheduled_date else '?'}. "
                  f"РџСЂРёС‡РёРЅР°: {data.get('reason', 'РќРµ СѓРєР°Р·Р°РЅР°')}",
            is_makeup=True
        )
        
        # РћР±РЅРѕРІР»СЏРµРј РёСЃС…РѕРґРЅСѓСЋ Р·Р°РїРёСЃСЊ
        attendance.notes = f"РџРµСЂРµРЅРµСЃРµРЅРѕ РЅР° {new_date.date()}. {attendance.notes}"
        
        db.session.add(new_attendance)
        db.session.commit()
        
        logger.info(f"вњ… РўСЂРµРЅРёСЂРѕРІРєР° РїРµСЂРµРЅРµСЃРµРЅР°: {attendance.id} -> {new_attendance.id}, user_id={user_id}")
        
        return jsonify({
            'success': True,
            'message': 'РўСЂРµРЅРёСЂРѕРІРєР° СѓСЃРїРµС€РЅРѕ РїРµСЂРµРЅРµСЃРµРЅР°',
            'new_attendance': {
                'id': new_attendance.id,
                'scheduled_date': new_attendance.scheduled_date.isoformat() if new_attendance.scheduled_date else None,
                'status': new_attendance.status
            }
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"вќЊ РћС€РёР±РєР° РїРµСЂРµРЅРѕСЃР° С‚СЂРµРЅРёСЂРѕРІРєРё: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': f'РћС€РёР±РєР° РїРµСЂРµРЅРѕСЃР° С‚СЂРµРЅРёСЂРѕРІРєРё: {str(e)}'}), 500

# ========== Р—РђРЇР’РљР ==========

@bp.route('/api/my-applications', methods=['GET'])
@login_required
def get_my_applications():
    """РџРѕР»СѓС‡РµРЅРёРµ Р·Р°СЏРІРѕРє РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ"""
    try:
        user_id = request.user_id
        
        applications = Application.query.filter_by(user_id=user_id).order_by(
            Application.created_at.desc()
        ).all()
        
        applications_data = []
        for app in applications:
            branch = Branch.query.get(app.branch_id) if app.branch_id else None
            applications_data.append({
                'id': app.id,
                'child_name': app.child_name,
                'birth_year': app.birth_year,
                'age_group': get_age_group_from_birth_year(app.birth_year) if app.birth_year else '',
                'branch_name': branch.name if branch else 'РќРµ СѓРєР°Р·Р°РЅ',
                'phone': app.phone,
                'email': app.email,
                'message': app.message,
                'trainer': app.trainer or '',
                'training_time': app.training_time or '',
                'status': app.status,
                'created_at': app.created_at.isoformat() if app.created_at else None,
                'date': app.created_at.strftime('%d.%m.%Y') if app.created_at else ''
            })
        
        return jsonify({
            'success': True,
            'applications': applications_data
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ Р·Р°СЏРІРѕРє: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ Р·Р°СЏРІРѕРє'}), 500

# ========== Р—РђРџРРЎР¬ РќРђ РўР Р•РќРР РћР’РљРЈ ==========

@bp.route('/api/my-applications', methods=['POST'])
@login_required
def create_my_application():
    try:
        user_id = request.user_id
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'Пользователь не найден'}), 404

        data = request.get_json() or {}
        child_id = data.get('child_id')
        branch_id = data.get('branch_id')
        schedule_id = data.get('schedule_id')
        message = str(data.get('message') or '').strip()

        if not child_id:
            return jsonify({'error': 'Укажите ребенка'}), 400

        if not branch_id:
            return jsonify({'error': 'Укажите филиал'}), 400

        child_info = get_child_info(user, child_id)
        if not child_info:
            return jsonify({'error': 'Ребенок не найден в профиле'}), 404

        birth_year = normalize_birth_year(child_info.get('birth_year'))
        if not birth_year:
            return jsonify({'error': 'У ребенка не указан корректный год рождения'}), 400

        branch = Branch.query.filter_by(id=int(branch_id), is_active=True).first()
        if not branch:
            return jsonify({'error': 'Филиал не найден'}), 404

        matched_schedules = filter_schedules_by_birth_year(
            AgeSchedule.query.filter_by(branch_id=branch.id, is_active=True).all(),
            birth_year,
        )
        if not matched_schedules:
            return jsonify({'error': 'Для выбранного филиала нет подходящего расписания'}), 400

        selected_schedule = matched_schedules[0]
        if schedule_id not in (None, '', False):
            try:
                schedule_id = int(schedule_id)
            except (TypeError, ValueError):
                return jsonify({'error': 'Некорректное расписание'}), 400

            selected_schedule = next(
                (schedule for schedule in matched_schedules if schedule.id == schedule_id),
                None,
            )
            if not selected_schedule:
                return jsonify({'error': 'Выбранное расписание не подходит ребенку'}), 400

        day_names = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
        days_display = []
        for day_number in parse_days_of_week(selected_schedule.days_of_week):
            if 0 <= day_number < len(day_names):
                days_display.append(day_names[day_number])

        time_label = selected_schedule.time or ''
        if getattr(selected_schedule, 'end_time', None):
            time_label = f"{time_label}-{selected_schedule.end_time}"

        training_time = ', '.join(days_display)
        if time_label:
            training_time = f"{training_time} {time_label}".strip()

        application = Application(
            user_id=user_id,
            child_name=child_info.get('name') or '',
            birth_year=birth_year,
            branch_id=branch.id,
            phone=user.phone or '',
            email=user.email or '',
            message=message,
            status='pending',
            trainer=selected_schedule.instructor or '',
            training_time=training_time,
        )

        db.session.add(application)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Заявка сохранена в личном кабинете',
            'application': {
                'id': application.id,
                'child_name': application.child_name,
                'birth_year': application.birth_year,
                'age_group': get_age_group_from_birth_year(application.birth_year),
                'branch_name': branch.name,
                'phone': application.phone,
                'email': application.email,
                'message': application.message,
                'trainer': application.trainer or '',
                'training_time': application.training_time or '',
                'status': application.status,
                'created_at': application.created_at.isoformat() if application.created_at else None,
                'date': application.created_at.strftime('%d.%m.%Y') if application.created_at else '',
            }
        }), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Ошибка создания заявки из личного кабинета: {str(e)}")
        return jsonify({'error': 'Не удалось создать заявку'}), 500

@bp.route('/api/schedule/available-dates', methods=['GET'])
@login_required
def get_available_dates():
    """РџРѕР»СѓС‡РµРЅРёРµ РґРѕСЃС‚СѓРїРЅС‹С… РґР°С‚ РґР»СЏ Р·Р°РїРёСЃРё"""
    try:
        schedule_id = request.args.get('schedule_id', type=int)
        child_id = request.args.get('child_id', type=int)
        
        if not schedule_id or not child_id:
            return jsonify({'error': 'РќРµ СѓРєР°Р·Р°РЅС‹ РѕР±СЏР·Р°С‚РµР»СЊРЅС‹Рµ РїР°СЂР°РјРµС‚СЂС‹'}), 400
        
        schedule = AgeSchedule.query.get(schedule_id)
        if not schedule:
            return jsonify({'error': 'Р Р°СЃРїРёСЃР°РЅРёРµ РЅРµ РЅР°Р№РґРµРЅРѕ'}), 404
        
        # РџРѕР»СѓС‡Р°РµРј РґРЅРё РЅРµРґРµР»Рё
        days_list = schedule.days_of_week
        if isinstance(days_list, str):
            try:
                days_list = json.loads(days_list)
            except:
                days_list = []
        elif days_list is None:
            days_list = []
        
        if not days_list:
            return jsonify({
                'success': True,
                'available_dates': []
            })
        
        # РћРїСЂРµРґРµР»СЏРµРј РїРµСЂРёРѕРґ (СЃР»РµРґСѓСЋС‰РёРµ 30 РґРЅРµР№)
        start_date = datetime.utcnow()
        end_date = start_date + timedelta(days=30)
        
        available_dates = []
        current_date = start_date
        
        while current_date <= end_date:
            # РџСЂРѕРІРµСЂСЏРµРј, СЃРѕРІРїР°РґР°РµС‚ Р»Рё РґРµРЅСЊ РЅРµРґРµР»Рё
            # Python: 0=РџРЅ, 1=Р’С‚, ..., 6=Р’СЃ
            if current_date.weekday() in days_list:
                available_dates.append({
                    'date': current_date.date().isoformat(),
                    'day_name': ['РџРЅ', 'Р’С‚', 'РЎСЂ', 'Р§С‚', 'РџС‚', 'РЎР±', 'Р’СЃ'][current_date.weekday()],
                    'time': schedule.time
                })
            
            current_date += timedelta(days=1)
        
        return jsonify({
            'success': True,
            'available_dates': available_dates
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РґРѕСЃС‚СѓРїРЅС‹С… РґР°С‚: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РґР°РЅРЅС‹С…'}), 500

@bp.route('/api/attendance/book', methods=['POST'])
@login_required
def book_attendance():
    """Р—Р°РїРёСЃСЊ РЅР° С‚СЂРµРЅРёСЂРѕРІРєСѓ"""
    try:
        user_id = request.user_id
        data = request.get_json()
        
        required_fields = ['schedule_id', 'child_id', 'date']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'РћС‚СЃСѓС‚СЃС‚РІСѓРµС‚ РїРѕР»Рµ: {field}'}), 400
        
        # РџСЂРѕРІРµСЂСЏРµРј СЂР°СЃРїРёСЃР°РЅРёРµ
        schedule = AgeSchedule.query.get(data['schedule_id'])
        if not schedule or not schedule.is_active:
            return jsonify({'error': 'Р Р°СЃРїРёСЃР°РЅРёРµ РЅРµ РЅР°Р№РґРµРЅРѕ РёР»Рё РЅРµР°РєС‚РёРІРЅРѕ'}), 400
        
        # РџСЂРѕРІРµСЂСЏРµРј РґРµРЅСЊ РЅРµРґРµР»Рё
        target_date = datetime.fromisoformat(data['date'].replace('Z', '+00:00'))
        schedule_days = schedule.days_of_week
        if isinstance(schedule_days, str):
            try:
                schedule_days = json.loads(schedule_days)
            except:
                schedule_days = []
        
        if target_date.weekday() not in schedule_days:
            return jsonify({'error': 'Р’С‹Р±СЂР°РЅРЅР°СЏ РґР°С‚Р° РЅРµ СЃРѕРѕС‚РІРµС‚СЃС‚РІСѓРµС‚ СЂР°СЃРїРёСЃР°РЅРёСЋ'}), 400
        
        # РџСЂРѕРІРµСЂСЏРµРј, РµСЃС‚СЊ Р»Рё Сѓ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ Р°РєС‚РёРІРЅР°СЏ РѕРїР»Р°С‚Р°
        active_payment = Payment.query.filter(
            Payment.user_id == user_id,
            Payment.child_id == data['child_id'],
            Payment.remaining_trainings > 0,
            Payment.end_date > datetime.utcnow(),
            Payment.status == 'confirmed'
        ).first()
        
        if not active_payment:
            return jsonify({'error': 'РќРµС‚ Р°РєС‚РёРІРЅРѕР№ РѕРїР»Р°С‚С‹ РґР»СЏ СЌС‚РѕРіРѕ СЂРµР±РµРЅРєР°'}), 400
        
        # РџСЂРѕРІРµСЂСЏРµРј, РЅРµ Р·Р°РїРёСЃР°РЅ Р»Рё СѓР¶Рµ СЂРµР±РµРЅРѕРє РЅР° СЌС‚Сѓ РґР°С‚Сѓ
        existing_attendance = Attendance.query.filter(
            Attendance.user_id == user_id,
            Attendance.child_id == data['child_id'],
            Attendance.scheduled_date == target_date,
            Attendance.status.in_(['scheduled', 'attended', 'rescheduled'])
        ).first()
        
        if existing_attendance:
            return jsonify({'error': 'Р РµР±РµРЅРѕРє СѓР¶Рµ Р·Р°РїРёСЃР°РЅ РЅР° СЌС‚Сѓ РґР°С‚Сѓ'}), 400
        
        # РџСЂРѕРІРµСЂСЏРµРј РєРѕР»РёС‡РµСЃС‚РІРѕ Р·Р°РїРёСЃРµР№ РЅР° СЌС‚Рѕ РІСЂРµРјСЏ (РµРјРєРѕСЃС‚СЊ)
        scheduled_count = Attendance.query.filter(
            Attendance.schedule_id == data['schedule_id'],
            Attendance.scheduled_date == target_date,
            Attendance.status.in_(['scheduled', 'attended', 'rescheduled'])
        ).count()
        
        if scheduled_count >= schedule.capacity:
            return jsonify({'error': 'РќР° СЌС‚Рѕ РІСЂРµРјСЏ РЅРµС‚ СЃРІРѕР±РѕРґРЅС‹С… РјРµСЃС‚'}), 400
        
        # РЎРѕР·РґР°РµРј Р·Р°РїРёСЃСЊ Рѕ РїРѕСЃРµС‰РµРЅРёРё
        attendance = Attendance(
            user_id=user_id,
            child_id=data['child_id'],
            payment_id=active_payment.id,
            schedule_id=data['schedule_id'],
            scheduled_date=target_date,
            age_group=schedule.age_group,
            branch_id=schedule.branch_id,
            status='scheduled'
        )
        
        db.session.add(attendance)
        db.session.commit()
        
        logger.info(f"вњ… Р—Р°РїРёСЃСЊ РЅР° С‚СЂРµРЅРёСЂРѕРІРєСѓ СЃРѕР·РґР°РЅР°: user_id={user_id}, child_id={data['child_id']}")
        
        return jsonify({
            'success': True,
            'message': 'Р—Р°РїРёСЃСЊ РЅР° С‚СЂРµРЅРёСЂРѕРІРєСѓ СЃРѕР·РґР°РЅР°',
            'attendance_id': attendance.id
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"вќЊ РћС€РёР±РєР° Р·Р°РїРёСЃРё РЅР° С‚СЂРµРЅРёСЂРѕРІРєСѓ: {str(e)}")
        return jsonify({'error': f'РћС€РёР±РєР° Р·Р°РїРёСЃРё: {str(e)}'}), 500

@bp.route('/api/attendance/cancel/<int:attendance_id>', methods=['POST'])
@login_required
def cancel_attendance(attendance_id):
    """РћС‚РјРµРЅР° Р·Р°РїРёСЃРё РЅР° С‚СЂРµРЅРёСЂРѕРІРєСѓ"""
    try:
        user_id = request.user_id
        
        attendance = Attendance.query.get(attendance_id)
        if not attendance:
            return jsonify({'error': 'Р—Р°РїРёСЃСЊ РЅРµ РЅР°Р№РґРµРЅР°'}), 404
        
        if attendance.user_id != user_id:
            return jsonify({'error': 'РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїСЂР°РІ'}), 403
        
        # РњРѕР¶РЅРѕ РѕС‚РјРµРЅСЏС‚СЊ С‚РѕР»СЊРєРѕ Р±СѓРґСѓС‰РёРµ Р·Р°РїРёСЃРё
        if attendance.scheduled_date < datetime.utcnow():
            return jsonify({'error': 'РќРµР»СЊР·СЏ РѕС‚РјРµРЅРёС‚СЊ РїСЂРѕС€РµРґС€СѓСЋ С‚СЂРµРЅРёСЂРѕРІРєСѓ'}), 400
        
        # Р•СЃР»Рё СѓР¶Рµ РѕС‚РјРµС‡РµРЅРѕ РєР°Рє РїСЂРёСЃСѓС‚СЃС‚РІРѕРІР°Р», РЅРµР»СЊР·СЏ РѕС‚РјРµРЅРёС‚СЊ
        if attendance.status == 'attended':
            return jsonify({'error': 'РќРµР»СЊР·СЏ РѕС‚РјРµРЅРёС‚СЊ РїРѕСЃРµС‰РµРЅРЅСѓСЋ С‚СЂРµРЅРёСЂРѕРІРєСѓ'}), 400
        
        attendance.status = 'cancelled'
        db.session.commit()
        
        logger.info(f"вњ… Р—Р°РїРёСЃСЊ РѕС‚РјРµРЅРµРЅР°: attendance_id={attendance_id}")
        
        return jsonify({
            'success': True,
            'message': 'Р—Р°РїРёСЃСЊ РѕС‚РјРµРЅРµРЅР°'
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"вќЊ РћС€РёР±РєР° РѕС‚РјРµРЅС‹ Р·Р°РїРёСЃРё: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РѕС‚РјРµРЅС‹ Р·Р°РїРёСЃРё'}), 500

# ========== Р’РЎРџРћРњРћР“РђРўР•Р›Р¬РќР«Р• Р¤РЈРќРљР¦РР ==========

def get_available_schedule_dates(schedule_id, start_date, end_date):
    """РџРѕР»СѓС‡РµРЅРёРµ РґРѕСЃС‚СѓРїРЅС‹С… РґР°С‚ РґР»СЏ СЂР°СЃРїРёСЃР°РЅРёСЏ"""
    try:
        schedule = AgeSchedule.query.get(schedule_id)
        if not schedule:
            return []
        
        # РџРѕР»СѓС‡Р°РµРј РґРЅРё РЅРµРґРµР»Рё
        days_list = schedule.days_of_week
        if isinstance(days_list, str):
            try:
                days_list = json.loads(days_list)
            except:
                days_list = []
        elif days_list is None:
            days_list = []
        
        if not days_list:
            return []
        
        available_dates = []
        current_date = start_date
        
        while current_date <= end_date:
            # РџСЂРѕРІРµСЂСЏРµРј, СЃРѕРІРїР°РґР°РµС‚ Р»Рё РґРµРЅСЊ РЅРµРґРµР»Рё
            if current_date.weekday() in days_list:  # Python: 0=РџРЅ, 6=Р’СЃ
                available_dates.append(current_date.date())
            
            current_date += timedelta(days=1)
        
        return available_dates
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РґРѕСЃС‚СѓРїРЅС‹С… РґР°С‚: {str(e)}")
        return []

# ========== РРЎРўРћР РРЇ Р РЎРўРђРўРРЎРўРРљРђ ==========

@bp.route('/api/stats', methods=['GET'])
@login_required
def get_user_stats():
    """РџРѕР»СѓС‡РµРЅРёРµ СЃС‚Р°С‚РёСЃС‚РёРєРё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ"""
    try:
        user_id = request.user_id
        
        # РћР±С‰Р°СЏ СЃС‚Р°С‚РёСЃС‚РёРєР°
        total_attended = Attendance.query.filter_by(
            user_id=user_id,
            status='attended'
        ).count()
        
        total_missed = Attendance.query.filter_by(
            user_id=user_id,
            status='missed'
        ).count()
        
        total_scheduled = Attendance.query.filter_by(
            user_id=user_id,
            status='scheduled'
        ).count()
        
        total_payments = Payment.query.filter_by(user_id=user_id).count()
        active_payments = Payment.query.filter(
            Payment.user_id == user_id,
            Payment.remaining_trainings > 0,
            Payment.end_date > datetime.utcnow(),
            Payment.status == 'confirmed'
        ).count()
        
        return jsonify({
            'success': True,
            'stats': {
                'attendance': {
                    'attended': total_attended,
                    'missed': total_missed,
                    'scheduled': total_scheduled,
                    'total': total_attended + total_missed + total_scheduled
                },
                'payments': {
                    'total': total_payments,
                    'active': active_payments
                }
            }
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ СЃС‚Р°С‚РёСЃС‚РёРєРё: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ СЃС‚Р°С‚РёСЃС‚РёРєРё'}), 500

@bp.route('/api/attendance/history', methods=['GET'])
@login_required
def get_attendance_history():
    """РџРѕР»СѓС‡РµРЅРёРµ РёСЃС‚РѕСЂРёРё РїРѕСЃРµС‰РµРЅРёР№"""
    try:
        user_id = request.user_id
        child_id = request.args.get('child_id', type=int)
        
        query = Attendance.query.filter_by(user_id=user_id)
        
        if child_id:
            query = query.filter_by(child_id=child_id)
        
        attendance = query.order_by(Attendance.scheduled_date.desc()).all()
        
        history = []
        for record in attendance:
            branch = Branch.query.get(record.branch_id) if record.branch_id else None
            
            history.append({
                'id': record.id,
                'child_id': record.child_id,
                'date': record.scheduled_date.isoformat() if record.scheduled_date else None,
                'time': record.scheduled_date.strftime('%H:%M') if record.scheduled_date else None,
                'branch_name': branch.name if branch else 'РќРµ СѓРєР°Р·Р°РЅ',
                'status': record.status,
                'age_group': record.age_group,
                'notes': record.notes
            })
        
        return jsonify({
            'success': True,
            'history': history
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РёСЃС‚РѕСЂРёРё: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РёСЃС‚РѕСЂРёРё'}), 500


