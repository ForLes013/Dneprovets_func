# routes/admin.py
from copy import deepcopy
from flask import Blueprint, request, jsonify, send_file
from flask_cors import cross_origin
from models import db, User, Token, Payment, Attendance, Branch, AgeSchedule, Application, SiteSetting
from utils import (
    admin_required,
    logger,
    get_age_group_from_birth_year,
    get_child_info,
    parse_days_of_week,
    build_training_datetime,
    sync_payment_counters,
    DEFAULT_CONTACT_INFO,
    DEFAULT_ACHIEVEMENTS,
    DEFAULT_PAYMENT_PLANS,
    DEFAULT_TRAINERS,
    filter_schedules_by_birth_year,
    format_age_group_range,
    get_age_group_sort_key,
    hash_password,
    normalize_birth_year,
    normalize_children_payload,
    normalize_payment_plans_payload,
    parse_age_group_range,
)
from datetime import datetime, timedelta
from io import BytesIO
import json
import calendar
import xlsxwriter

bp = Blueprint('admin', __name__, url_prefix='/api/admin')  # Р”РѕР±Р°РІСЊС‚Рµ url_prefix Р·РґРµСЃСЊ

MAX_BRANCH_PHOTO_LENGTH = 7_000_000
REPORT_PAYMENT_STATUS_LABELS = {
    'pending': 'Ожидает подтверждения',
    'confirmed': 'Подтвержден',
    'failed': 'Неуспешен',
}
REPORT_ATTENDANCE_STATUS_LABELS = {
    'scheduled': 'Запланировано',
    'attended': 'Посетил',
    'missed': 'Пропуск',
    'rescheduled': 'Перенесено',
}


def normalize_branch_photo(photo_data):
    if photo_data in (None, "", False):
        return None

    if not isinstance(photo_data, str):
        raise ValueError('Р¤РѕС‚Рѕ С„РёР»РёР°Р»Р° РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ СЃС‚СЂРѕРєРѕР№')

    photo_data = photo_data.strip()
    if not photo_data.startswith('data:image/'):
        raise ValueError('РџРѕРґРґРµСЂР¶РёРІР°СЋС‚СЃСЏ С‚РѕР»СЊРєРѕ РёР·РѕР±СЂР°Р¶РµРЅРёСЏ')

    if len(photo_data) > MAX_BRANCH_PHOTO_LENGTH:
        raise ValueError('Р¤РѕС‚Рѕ СЃР»РёС€РєРѕРј Р±РѕР»СЊС€РѕРµ')

    return photo_data


def serialize_branch(branch, include_schedule_count=False):
    branch_data = {
        'id': branch.id,
        'name': branch.name,
        'address': branch.address,
        'phone': branch.phone,
        'email': branch.email,
        'photo_data': branch.photo_data,
        'is_active': branch.is_active,
        'created_at': branch.created_at.isoformat() if branch.created_at else None,
    }

    if include_schedule_count:
        branch_data['schedule_count'] = AgeSchedule.query.filter_by(branch_id=branch.id).count()

    return branch_data


def get_site_setting_payload(key, default_value):
    setting = SiteSetting.query.filter_by(key=key).first()
    if not setting or setting.value in (None, ""):
        return deepcopy(default_value)
    return deepcopy(setting.value)


def save_site_setting_payload(key, value):
    setting = SiteSetting.query.filter_by(key=key).first()
    if setting:
        setting.value = value
    else:
        setting = SiteSetting(key=key, value=value)
        db.session.add(setting)
    return setting


def normalize_schedule_age_group(data, fallback=None):
    age_group = (data.get('age_group') or fallback or '').strip()
    start_year, end_year = parse_age_group_range(age_group)
    if start_year is None and end_year is None:
        raise ValueError('Укажите диапазон годов рождения в формате 2012-2019')
    return format_age_group_range(start_year, end_year, fallback=age_group)


def normalize_contact_info_payload(payload):
    if payload is None:
        return deepcopy(DEFAULT_CONTACT_INFO)

    if not isinstance(payload, dict):
        raise ValueError('РљРѕРЅС‚Р°РєС‚РЅР°СЏ РёРЅС„РѕСЂРјР°С†РёСЏ РґРѕР»Р¶РЅР° Р±С‹С‚СЊ РѕР±СЉРµРєС‚РѕРј')

    normalized = deepcopy(DEFAULT_CONTACT_INFO)
    for key in normalized:
        value = payload.get(key, normalized[key])
        normalized[key] = str(value or '').strip()

    return normalized


def normalize_trainers_payload(payload):
    if payload is None:
        return deepcopy(DEFAULT_TRAINERS)

    if not isinstance(payload, list):
        raise ValueError('РЎРїРёСЃРѕРє С‚СЂРµРЅРµСЂРѕРІ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РјР°СЃСЃРёРІРѕРј')

    trainers = []
    for item in payload[:30]:
        if not isinstance(item, dict):
            continue

        trainer = {
            'name': str(item.get('name') or '').strip(),
            'title': str(item.get('title') or '').strip(),
            'description': str(item.get('description') or '').strip(),
            'photo_data': str(item.get('photo_data') or item.get('photoData') or '').strip(),
        }

        if trainer['name'] or trainer['title'] or trainer['description'] or trainer['photo_data']:
            trainers.append(trainer)

    return trainers


def normalize_achievements_payload(payload):
    normalized = deepcopy(DEFAULT_ACHIEVEMENTS)

    if payload is None:
        return normalized

    if not isinstance(payload, dict):
        raise ValueError('Блок достижений должен быть объектом')

    normalized['title'] = str(payload.get('title') or normalized['title']).strip()
    normalized['intro'] = str(payload.get('intro') or normalized['intro']).strip()

    items = payload.get('items', [])
    if not isinstance(items, list):
        raise ValueError('Список достижений должен быть массивом')

    normalized_items = []
    for item in items[:24]:
        if not isinstance(item, dict):
            continue

        achievement_item = {
            'value': str(item.get('value') or '').strip(),
            'title': str(item.get('title') or '').strip(),
            'description': str(item.get('description') or '').strip(),
        }

        if (
            achievement_item['value']
            or achievement_item['title']
            or achievement_item['description']
        ):
            normalized_items.append(achievement_item)

    normalized['items'] = (
        normalized_items if normalized_items else deepcopy(DEFAULT_ACHIEVEMENTS['items'])
    )

    news_items = payload.get('news', [])
    if not isinstance(news_items, list):
        raise ValueError('Список новостей должен быть массивом')

    normalized_news = []
    for item in news_items[:24]:
        if not isinstance(item, dict):
            continue

        news_item = {
            'title': str(item.get('title') or '').strip(),
            'date': str(item.get('date') or '').strip(),
            'tag': str(item.get('tag') or '').strip(),
            'summary': str(item.get('summary') or '').strip(),
            'content': str(item.get('content') or '').strip(),
        }

        if (
            news_item['title']
            or news_item['summary']
            or news_item['content']
            or news_item['date']
            or news_item['tag']
        ):
            normalized_news.append(news_item)

    normalized['news'] = (
        normalized_news
        if 'news' in payload
        else deepcopy(DEFAULT_ACHIEVEMENTS.get('news', []))
    )
    return normalized


def format_report_date(value, include_time=False):
    if not value:
        return ''

    if isinstance(value, str):
        return value

    try:
        return value.strftime('%d.%m.%Y %H:%M' if include_time else '%d.%m.%Y')
    except Exception:
        return str(value)


def format_report_bool(value):
    return 'Да' if value else 'Нет'


def get_child_for_report(children_lookup, user_id, child_id):
    for child in children_lookup.get(user_id, []):
        if child.get('id') == child_id:
            return child
    return {}


def write_report_sheet(workbook, title, headers, rows):
    worksheet = workbook.add_worksheet(title[:31])
    header_format = workbook.add_format({
        'bold': True,
        'bg_color': '#1F2937',
        'font_color': '#FFFFFF',
        'border': 1,
        'align': 'center',
        'valign': 'vcenter',
    })
    cell_format = workbook.add_format({
        'border': 1,
        'valign': 'top',
    })
    alternate_cell_format = workbook.add_format({
        'border': 1,
        'valign': 'top',
        'bg_color': '#F8FAFC',
    })
    wrap_cell_format = workbook.add_format({
        'border': 1,
        'valign': 'top',
        'text_wrap': True,
    })
    alternate_wrap_cell_format = workbook.add_format({
        'border': 1,
        'valign': 'top',
        'text_wrap': True,
        'bg_color': '#F8FAFC',
    })

    worksheet.freeze_panes(1, 0)
    worksheet.set_row(0, 28)

    max_lengths = []
    for col_index, header in enumerate(headers):
        worksheet.write(0, col_index, header, header_format)
        max_lengths.append(len(str(header)))

    for row_index, row in enumerate(rows, start=1):
        base_format = alternate_cell_format if row_index % 2 == 0 else cell_format
        wrapped_format = alternate_wrap_cell_format if row_index % 2 == 0 else wrap_cell_format

        for col_index, value in enumerate(row):
            normalized_value = '' if value is None else value
            should_wrap = isinstance(normalized_value, str) and (
                '\n' in normalized_value or len(normalized_value) > 42
            )
            worksheet.write(
                row_index,
                col_index,
                normalized_value,
                wrapped_format if should_wrap else base_format,
            )
            max_lengths[col_index] = max(
                max_lengths[col_index],
                min(len(str(normalized_value)), 60),
            )

    if headers:
        last_row = max(len(rows), 1)
        worksheet.autofilter(0, 0, last_row, len(headers) - 1)

    for col_index, width in enumerate(max_lengths):
        worksheet.set_column(col_index, col_index, min(max(width + 2, 12), 42))

    return worksheet


def serialize_schedule(schedule, branch=None):
    start_year, end_year = parse_age_group_range(schedule.age_group)
    days_list = parse_days_of_week(schedule.days_of_week)
    day_names = []
    for day_num in days_list:
        if 0 <= day_num <= 6:
            day_names.append(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][day_num])

    return {
        'id': schedule.id,
        'age_group': schedule.age_group,
        'birth_year_from': start_year,
        'birth_year_to': end_year,
        'days_of_week': days_list,
        'days_display': day_names,
        'days_string': ', '.join(day_names),
        'time': schedule.time,
        'end_time': schedule.end_time,
        'branch_id': schedule.branch_id,
        'branch_name': branch.name if branch else 'Неизвестно',
        'capacity': schedule.capacity,
        'instructor': schedule.instructor or '',
        'is_active': schedule.is_active,
        'created_at': schedule.created_at.isoformat() if schedule.created_at else None,
    }


def get_user_children_payload(user):
    if not user or not user.children:
        return []

    if isinstance(user.children, list):
        return user.children

    if isinstance(user.children, str):
        try:
            parsed_children = json.loads(user.children)
            return parsed_children if isinstance(parsed_children, list) else []
        except Exception:
            return []

    return []


def serialize_user_for_admin(user, include_stats=True):
    children = get_user_children_payload(user)

    payload = {
        'id': user.id,
        'name': user.name,
        'email': user.email,
        'phone': user.phone,
        'children': children,
        'registered_at': user.registered_at.isoformat() if user.registered_at else None,
    }

    if include_stats:
        payload['stats'] = {
            'payments': Payment.query.filter_by(user_id=user.id).count(),
            'attendance': Attendance.query.filter_by(user_id=user.id).count(),
            'applications': Application.query.filter_by(user_id=user.id).count(),
            'children_count': len(children),
        }

    return payload


def create_payment_attendance_records(payment, user):
    """РЎРѕР·РґР°РµС‚ Р·Р°РїР»Р°РЅРёСЂРѕРІР°РЅРЅС‹Рµ РїРѕСЃРµС‰РµРЅРёСЏ РїРѕ РѕРїР»Р°С‚Рµ, СЂРµР±РµРЅРєСѓ Рё СЂР°СЃРїРёСЃР°РЅРёСЋ С„РёР»РёР°Р»Р°."""
    child_info = get_child_info(user, payment.child_id)
    if not child_info:
        raise ValueError('Р РµР±РµРЅРѕРє РґР»СЏ СЌС‚РѕР№ РѕРїР»Р°С‚С‹ РЅРµ РЅР°Р№РґРµРЅ')

    birth_year = child_info.get('birth_year')
    if not birth_year:
        raise ValueError('РЈ СЂРµР±РµРЅРєР° РЅРµ СѓРєР°Р·Р°РЅ РіРѕРґ СЂРѕР¶РґРµРЅРёСЏ')

    if not payment.branch_id:
        raise ValueError('РЈ РѕРїР»Р°С‚С‹ РЅРµ СѓРєР°Р·Р°РЅ С„РёР»РёР°Р»')

    normalized_birth_year = normalize_birth_year(birth_year)
    if not normalized_birth_year:
        raise ValueError('Не удалось определить год рождения ребенка')

    schedules = filter_schedules_by_birth_year(
        AgeSchedule.query.filter_by(branch_id=payment.branch_id, is_active=True).all(),
        normalized_birth_year,
    )

    if not schedules:
        raise ValueError('Р”Р»СЏ СЂРµР±РµРЅРєР° РЅРµС‚ Р°РєС‚РёРІРЅРѕРіРѕ СЂР°СЃРїРёСЃР°РЅРёСЏ РІ РІС‹Р±СЂР°РЅРЅРѕРј С„РёР»РёР°Р»Рµ')

    existing_attendance = Attendance.query.filter_by(payment_id=payment.id).all()
    existing_keys = {
        (record.schedule_id, record.scheduled_date)
        for record in existing_attendance
        if record.schedule_id and record.scheduled_date
    }

    missing_count = max(0, payment.training_count - len(existing_attendance))
    if missing_count == 0:
        return 0

    start_date = payment.start_date or datetime.utcnow()
    end_date = payment.end_date or (start_date + timedelta(days=30))
    if end_date < start_date:
        end_date = start_date

    created_count = 0
    current_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
    search_limit_date = end_date + timedelta(days=120)

    while created_count < missing_count and current_date <= search_limit_date:
        for schedule in schedules:
            schedule_days = parse_days_of_week(schedule.days_of_week)
            if current_date.weekday() not in schedule_days:
                continue

            scheduled_datetime = build_training_datetime(current_date, schedule.time)
            if scheduled_datetime < start_date:
                continue

            candidate_key = (schedule.id, scheduled_datetime)
            if candidate_key in existing_keys:
                continue

            attendance = Attendance(
                user_id=payment.user_id,
                child_id=payment.child_id,
                payment_id=payment.id,
                schedule_id=schedule.id,
                scheduled_date=scheduled_datetime,
                age_group=schedule.age_group,
                branch_id=payment.branch_id,
                status='scheduled',
                notes=f'РўСЂРµРЅРёСЂРѕРІРєР° {len(existing_attendance) + created_count + 1}/{payment.training_count}'
            )
            db.session.add(attendance)
            existing_keys.add(candidate_key)
            created_count += 1

            if created_count >= missing_count:
                break

        current_date += timedelta(days=1)

    return created_count


def remove_payment_attendance_records(payment):
    attendance_records = (
        Attendance.query.filter_by(payment_id=payment.id)
        .order_by(Attendance.scheduled_date.desc())
        .all()
    )

    blocking_records = [
        record for record in attendance_records if record.status != 'scheduled'
    ]
    if blocking_records:
        raise ValueError(
            'РќРµР»СЊР·СЏ СЃРЅСЏС‚СЊ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ РѕРїР»Р°С‚С‹, РїРѕС‚РѕРјСѓ С‡С‚Рѕ РїРѕ РЅРµР№ СѓР¶Рµ РµСЃС‚СЊ РѕС‚РјРµС‡РµРЅРЅС‹Рµ РёР»Рё РїРµСЂРµРЅРµСЃРµРЅРЅС‹Рµ РїРѕСЃРµС‰РµРЅРёСЏ.'
        )

    removed_count = len(attendance_records)
    for record in attendance_records:
        db.session.delete(record)

    return removed_count


@bp.route('/cleanup-tokens', methods=['POST'])
@cross_origin()
@admin_required
def cleanup_tokens():
    """РћС‡РёСЃС‚РєР° РІСЃРµС… С‚РѕРєРµРЅРѕРІ (РґР»СЏ РѕС‚Р»Р°РґРєРё)"""
    try:
        count = Token.query.delete()
        db.session.commit()
        
        logger.info(f"рџ—‘пёЏ РЈРґР°Р»РµРЅРѕ {count} С‚РѕРєРµРЅРѕРІ")
        
        return jsonify({
            'success': True,
            'message': f'РЈРґР°Р»РµРЅРѕ {count} С‚РѕРєРµРЅРѕРІ'
        })
        
    except ValueError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

    except Exception as e:
        db.session.rollback()
        logger.error(f"вќЊ РћС€РёР±РєР° РѕС‡РёСЃС‚РєРё С‚РѕРєРµРЅРѕРІ: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РѕС‡РёСЃС‚РєРё С‚РѕРєРµРЅРѕРІ'}), 500

# ========== API Р”Р›РЇ Р¤РР›РРђР›РћР’ ==========

@bp.route('/branches', methods=['GET'])
@admin_required
def get_branches():
    """РџРѕР»СѓС‡РµРЅРёРµ СЃРїРёСЃРєР° РІСЃРµС… С„РёР»РёР°Р»РѕРІ"""
    try:
        branches = Branch.query.order_by(Branch.name).all()
        
        return jsonify({
            'success': True,
            'branches': [serialize_branch(branch, include_schedule_count=True) for branch in branches]
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ С„РёР»РёР°Р»РѕРІ: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ С„РёР»РёР°Р»РѕРІ'}), 500

@bp.route('/branches', methods=['POST'])
@admin_required
def create_branch():
    """РЎРѕР·РґР°РЅРёРµ РЅРѕРІРѕРіРѕ С„РёР»РёР°Р»Р°"""
    try:
        data = request.get_json()
        
        required_fields = ['name', 'address']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'РћС‚СЃСѓС‚СЃС‚РІСѓРµС‚ РїРѕР»Рµ: {field}'}), 400
        
        branch = Branch(
            name=data['name'],
            address=data['address'],
            phone=data.get('phone'),
            email=data.get('email'),
            photo_data=normalize_branch_photo(data.get('photo_data')),
            is_active=bool(data.get('is_active', True))
        )
        
        db.session.add(branch)
        db.session.commit()
        
        logger.info(f"вњ… РЎРѕР·РґР°РЅ С„РёР»РёР°Р»: {branch.name}")
        
        return jsonify({
            'success': True,
            'message': 'Р¤РёР»РёР°Р» СЃРѕР·РґР°РЅ',
            'branch': serialize_branch(branch, include_schedule_count=True)
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"вќЊ РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ С„РёР»РёР°Р»Р°: {str(e)}")
        return jsonify({'error': f'РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ С„РёР»РёР°Р»Р°: {str(e)}'}), 500

@bp.route('/branches/<int:branch_id>', methods=['PUT'])
@admin_required
def update_branch(branch_id):
    """РћР±РЅРѕРІР»РµРЅРёРµ С„РёР»РёР°Р»Р°"""
    try:
        data = request.get_json()
        branch = Branch.query.get(branch_id)
        
        if not branch:
            return jsonify({'error': 'Р¤РёР»РёР°Р» РЅРµ РЅР°Р№РґРµРЅ'}), 404
        
        if 'name' in data:
            branch.name = data['name']
        if 'address' in data:
            branch.address = data['address']
        if 'phone' in data:
            branch.phone = data['phone']
        if 'email' in data:
            branch.email = data['email']
        if 'photo_data' in data:
            branch.photo_data = normalize_branch_photo(data.get('photo_data'))
        if 'is_active' in data:
            branch.is_active = bool(data['is_active'])
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Р¤РёР»РёР°Р» РѕР±РЅРѕРІР»РµРЅ',
            'branch': serialize_branch(branch, include_schedule_count=True)
        })
    except ValueError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        db.session.rollback()
        logger.error(f"вќЊ РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ С„РёР»РёР°Р»Р°: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ С„РёР»РёР°Р»Р°'}), 500

@bp.route('/branches/<int:branch_id>', methods=['DELETE'])
@admin_required
def delete_branch(branch_id):
    """РЈРґР°Р»РµРЅРёРµ С„РёР»РёР°Р»Р°"""
    try:
        branch = Branch.query.get(branch_id)
        
        if not branch:
            return jsonify({'error': 'Р¤РёР»РёР°Р» РЅРµ РЅР°Р№РґРµРЅ'}), 404
        
        # РџСЂРѕРІРµСЂСЏРµРј РІСЃРµ СЃРІСЏР·Р°РЅРЅС‹Рµ РґР°РЅРЅС‹Рµ
        schedule_count = AgeSchedule.query.filter_by(branch_id=branch_id).count()
        applications_count = Application.query.filter_by(branch_id=branch_id).count()
        payments_count = Payment.query.filter_by(branch_id=branch_id).count()
        attendance_count = Attendance.query.filter_by(branch_id=branch_id).count()
        
        error_messages = []
        if schedule_count > 0:
            error_messages.append(f'Р Р°СЃРїРёСЃР°РЅРёСЏ: {schedule_count} Р·Р°РїРёСЃРµР№')
        if applications_count > 0:
            error_messages.append(f'Р—Р°СЏРІРєРё: {applications_count} Р·Р°РїРёСЃРµР№')
        if payments_count > 0:
            error_messages.append(f'РџР»Р°С‚РµР¶Рё: {payments_count} Р·Р°РїРёСЃРµР№')
        if attendance_count > 0:
            error_messages.append(f'РџРѕСЃРµС‰РµРЅРёСЏ: {attendance_count} Р·Р°РїРёСЃРµР№')
        
        if error_messages:
            return jsonify({
                'error': f'РќРµР»СЊР·СЏ СѓРґР°Р»РёС‚СЊ С„РёР»РёР°Р». Р•СЃС‚СЊ СЃРІСЏР·Р°РЅРЅС‹Рµ РґР°РЅРЅС‹Рµ:',
                'details': error_messages,
                'counts': {
                    'schedules': schedule_count,
                    'applications': applications_count,
                    'payments': payments_count,
                    'attendance': attendance_count
                }
            }), 400
        
        # РЈРґР°Р»СЏРµРј С„РёР»РёР°Р»
        db.session.delete(branch)
        db.session.commit()
        
        logger.info(f"вњ… РЈРґР°Р»РµРЅ С„РёР»РёР°Р»: {branch.name} (ID: {branch_id})")
        
        return jsonify({
            'success': True,
            'message': 'Р¤РёР»РёР°Р» СѓРґР°Р»РµРЅ',
            'deleted_branch': {
                'id': branch.id,
                'name': branch.name
            }
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"вќЊ РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ С„РёР»РёР°Р»Р° {branch_id}: {str(e)}")
        return jsonify({'error': f'РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ С„РёР»РёР°Р»Р°: {str(e)}'}), 500
    
@bp.route('/branches/<int:branch_id>/force', methods=['DELETE'])
@admin_required
def force_delete_branch(branch_id):
    """РџСЂРёРЅСѓРґРёС‚РµР»СЊРЅРѕРµ СѓРґР°Р»РµРЅРёРµ С„РёР»РёР°Р»Р° СЃРѕ РІСЃРµРјРё СЃРІСЏР·Р°РЅРЅС‹РјРё РґР°РЅРЅС‹РјРё"""
    try:
        branch = Branch.query.get(branch_id)
        
        if not branch:
            return jsonify({'error': 'Р¤РёР»РёР°Р» РЅРµ РЅР°Р№РґРµРЅ'}), 404
        
        # РџРѕРґСЃС‡РёС‚С‹РІР°РµРј РґР°РЅРЅС‹Рµ РґР»СЏ Р»РѕРіРѕРІ
        schedule_count = AgeSchedule.query.filter_by(branch_id=branch_id).count()
        applications_count = Application.query.filter_by(branch_id=branch_id).count()
        payments_count = Payment.query.filter_by(branch_id=branch_id).count()
        attendance_count = Attendance.query.filter_by(branch_id=branch_id).count()
        
        # РЈРґР°Р»СЏРµРј СЃРІСЏР·Р°РЅРЅС‹Рµ РґР°РЅРЅС‹Рµ
        AgeSchedule.query.filter_by(branch_id=branch_id).delete()
        Application.query.filter_by(branch_id=branch_id).update({'branch_id': None})
        Payment.query.filter_by(branch_id=branch_id).update({'branch_id': None})
        Attendance.query.filter_by(branch_id=branch_id).update({'branch_id': None})
        
        # РЈРґР°Р»СЏРµРј С„РёР»РёР°Р»
        db.session.delete(branch)
        db.session.commit()
        
        logger.info(f"рџ—‘пёЏ РџСЂРёРЅСѓРґРёС‚РµР»СЊРЅРѕ СѓРґР°Р»РµРЅ С„РёР»РёР°Р»: {branch.name}")
        logger.info(f"рџ“Љ РЈРґР°Р»РµРЅРѕ: {schedule_count} СЂР°СЃРїРёСЃР°РЅРёР№, РѕР±РЅРѕРІР»РµРЅРѕ: {applications_count + payments_count + attendance_count} Р·Р°РїРёСЃРµР№")
        
        return jsonify({
            'success': True,
            'message': 'Р¤РёР»РёР°Р» Рё СЃРІСЏР·Р°РЅРЅС‹Рµ РґР°РЅРЅС‹Рµ СѓРґР°Р»РµРЅС‹',
            'deleted': {
                'branch_id': branch_id,
                'branch_name': branch.name,
                'schedules_deleted': schedule_count,
                'applications_updated': applications_count,
                'payments_updated': payments_count,
                'attendance_updated': attendance_count
            }
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"вќЊ РћС€РёР±РєР° РїСЂРёРЅСѓРґРёС‚РµР»СЊРЅРѕРіРѕ СѓРґР°Р»РµРЅРёСЏ С„РёР»РёР°Р»Р°: {str(e)}")
        return jsonify({'error': f'РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ: {str(e)}'}), 500
    
@bp.route('/branches/<int:branch_id>/dependencies', methods=['GET'])
@admin_required
def get_branch_dependencies(branch_id):
    """РџРѕР»СѓС‡РµРЅРёРµ РёРЅС„РѕСЂРјР°С†РёРё Рѕ СЃРІСЏР·Р°РЅРЅС‹С… РґР°РЅРЅС‹С… С„РёР»РёР°Р»Р°"""
    try:
        branch = Branch.query.get(branch_id)
        
        if not branch:
            return jsonify({'error': 'Р¤РёР»РёР°Р» РЅРµ РЅР°Р№РґРµРЅ'}), 404
        
        # РџРѕР»СѓС‡Р°РµРј РІСЃРµ СЃРІСЏР·Р°РЅРЅС‹Рµ РґР°РЅРЅС‹Рµ
        schedules = AgeSchedule.query.filter_by(branch_id=branch_id).all()
        applications = Application.query.filter_by(branch_id=branch_id).all()
        payments = Payment.query.filter_by(branch_id=branch_id).all()
        attendances = Attendance.query.filter_by(branch_id=branch_id).all()
        
        # РџРѕРґРіРѕС‚РѕРІРєР° РґР°РЅРЅС‹С…
        schedules_data = [{
            'id': s.id,
            'age_group': s.age_group,
            'days_of_week': s.days_of_week if isinstance(s.days_of_week, list) else json.loads(s.days_of_week) if isinstance(s.days_of_week, str) else [],
            'time': s.time,
            'capacity': s.capacity,
            'instructor': s.instructor
        } for s in schedules]
        
        applications_data = [{
            'id': a.id,
            'child_name': a.child_name,
            'phone': a.phone,
            'created_at': a.created_at.isoformat() if a.created_at else None
        } for a in applications]
        
        payments_data = [{
            'id': p.id,
            'user_id': p.user_id,
            'amount': p.amount,
            'status': p.status,
            'created_at': p.created_at.isoformat() if p.created_at else None
        } for p in payments]
        
        attendances_data = [{
            'id': a.id,
            'child_id': a.child_id,
            'scheduled_date': a.scheduled_date.isoformat() if a.scheduled_date else None,
            'status': a.status
        } for a in attendances]
        
        return jsonify({
            'success': True,
            'branch': {
                'id': branch.id,
                'name': branch.name,
                'address': branch.address
            },
            'dependencies': {
                'schedules': {
                    'count': len(schedules),
                    'items': schedules_data
                },
                'applications': {
                    'count': len(applications),
                    'items': applications_data
                },
                'payments': {
                    'count': len(payments),
                    'items': payments_data
                },
                'attendance': {
                    'count': len(attendances),
                    'items': attendances_data
                }
            },
            'summary': {
                'total_dependencies': len(schedules) + len(applications) + len(payments) + len(attendances),
                'can_delete': len(schedules) + len(applications) + len(payments) + len(attendances) == 0
            }
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ Р·Р°РІРёСЃРёРјРѕСЃС‚РµР№ С„РёР»РёР°Р»Р°: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РґР°РЅРЅС‹С…'}), 500

# ========== API Р”Р›РЇ Р РђРЎРџРРЎРђРќРРЇ ==========

@bp.route('/age-schedules', methods=['GET'])
@admin_required
def get_age_schedules():
    """РџРѕР»СѓС‡РµРЅРёРµ СЂР°СЃРїРёСЃР°РЅРёСЏ РїРѕ РІРѕР·СЂР°СЃС‚РЅС‹Рј РіСЂСѓРїРїР°Рј"""
    try:
        branch_id = request.args.get('branch_id', type=int)
        age_group = request.args.get('age_group')
        
        query = AgeSchedule.query
        
        if branch_id:
            query = query.filter_by(branch_id=branch_id)
        
        if age_group and age_group != 'all':
            query = query.filter_by(age_group=age_group)
        
        schedules = sorted(
            query.all(),
            key=lambda schedule: (
                get_age_group_sort_key(schedule.age_group),
                schedule.time,
                schedule.id,
            ),
        )
        
        schedules_data = []
        for schedule in schedules:
            branch = Branch.query.get(schedule.branch_id)
            schedules_data.append(serialize_schedule(schedule, branch=branch))
            continue
            
            # РџРѕР»СѓС‡Р°РµРј РґРЅРё РЅРµРґРµР»Рё
            days_list = schedule.days_of_week
            if isinstance(days_list, str):
                try:
                    days_list = json.loads(days_list)
                except:
                    days_list = []
            elif days_list is None:
                days_list = []
            
            # РџРѕР»СѓС‡Р°РµРј РѕС‚РѕР±СЂР°Р¶Р°РµРјС‹Рµ РЅР°Р·РІР°РЅРёСЏ РґРЅРµР№
            day_names = []
            for day_num in days_list:
                if 0 <= day_num <= 6:
                    day_names.append(['РџРЅ', 'Р’С‚', 'РЎСЂ', 'Р§С‚', 'РџС‚', 'РЎР±', 'Р’СЃ'][day_num])
            
            schedules_data.append({
                'id': schedule.id,
                'age_group': schedule.age_group,
                'days_of_week': days_list,
                'days_display': day_names,
                'days_string': ', '.join(day_names),
                'time': schedule.time,
                'end_time': schedule.end_time,  # Р”РѕР±Р°РІР»РµРЅРѕ
                'branch_id': schedule.branch_id,
                'branch_name': branch.name if branch else 'РќРµРёР·РІРµСЃС‚РЅРѕ',
                'capacity': schedule.capacity,
                'instructor': schedule.instructor or '',
                'is_active': schedule.is_active,
                'created_at': schedule.created_at.isoformat() if schedule.created_at else None
            })
        
        return jsonify({
            'success': True,
            'schedules': schedules_data
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ СЂР°СЃРїРёСЃР°РЅРёСЏ: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ СЂР°СЃРїРёСЃР°РЅРёСЏ'}), 500

@bp.route('/age-schedules', methods=['POST'])
@admin_required
def create_age_schedule():
    """РЎРѕР·РґР°РЅРёРµ СЂР°СЃРїРёСЃР°РЅРёСЏ РґР»СЏ РІРѕР·СЂР°СЃС‚РЅРѕР№ РіСЂСѓРїРїС‹ СЃ РЅРµСЃРєРѕР»СЊРєРёРјРё РґРЅСЏРјРё"""
    try:
        data = request.get_json()
        
        # Р’Р°Р»РёРґР°С†РёСЏ
        required_fields = ['age_group', 'days_of_week', 'time', 'branch_id']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'РћС‚СЃСѓС‚СЃС‚РІСѓРµС‚ РїРѕР»Рµ: {field}'}), 400
        
        # РџСЂРѕРІРµСЂСЏРµРј, С‡С‚Рѕ days_of_week СЌС‚Рѕ СЃРїРёСЃРѕРє
        days_list = data['days_of_week']
        if not isinstance(days_list, list):
            return jsonify({'error': 'days_of_week РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ СЃРїРёСЃРєРѕРј'}), 400
        
        if len(days_list) == 0:
            return jsonify({'error': 'Р’С‹Р±РµСЂРёС‚Рµ С…РѕС‚СЏ Р±С‹ РѕРґРёРЅ РґРµРЅСЊ'}), 400
        
        # РџСЂРѕРІРµСЂСЏРµРј, С‡С‚Рѕ РІСЃРµ РґРЅРё РІ РїСЂР°РІРёР»СЊРЅРѕРј РґРёР°РїР°Р·РѕРЅРµ
        for day in days_list:
            if not isinstance(day, int) or day < 0 or day > 6:
                return jsonify({'error': f'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РґРµРЅСЊ РЅРµРґРµР»Рё: {day}'}), 400
        
        # Р’Р°Р»РёРґР°С†РёСЏ РІСЂРµРјРµРЅРё РѕРєРѕРЅС‡Р°РЅРёСЏ
        end_time = data.get('end_time')
        if not end_time:
            return jsonify({'error': 'РћС‚СЃСѓС‚СЃС‚РІСѓРµС‚ РїРѕР»Рµ: end_time'}), 400
        
        # РџСЂРѕРІРµСЂРєР° С„РѕСЂРјР°С‚Р° РІСЂРµРјРµРЅРё (HH:MM)
        try:
            start_h, start_m = map(int, data['time'].split(':'))
            end_h, end_m = map(int, end_time.split(':'))
            
            # РџСЂРѕРІРµСЂРєР°, С‡С‚Рѕ РІСЂРµРјСЏ РѕРєРѕРЅС‡Р°РЅРёСЏ РїРѕР·Р¶Рµ РІСЂРµРјРµРЅРё РЅР°С‡Р°Р»Р°
            start_minutes = start_h * 60 + start_m
            end_minutes = end_h * 60 + end_m
            
            if end_minutes <= start_minutes:
                return jsonify({'error': 'Р’СЂРµРјСЏ РѕРєРѕРЅС‡Р°РЅРёСЏ РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РїРѕР·Р¶Рµ РІСЂРµРјРµРЅРё РЅР°С‡Р°Р»Р°'}), 400
                
        except ValueError:
            return jsonify({'error': 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ С„РѕСЂРјР°С‚ РІСЂРµРјРµРЅРё. РСЃРїРѕР»СЊР·СѓР№С‚Рµ HH:MM'}), 400
        
        # РџСЂРѕРІРµСЂСЏРµРј, РЅРµС‚ Р»Рё СѓР¶Рµ С‚Р°РєРѕРіРѕ СЂР°СЃРїРёСЃР°РЅРёСЏ
        try:
            normalized_age_group = normalize_schedule_age_group(data)
        except ValueError as exc:
            return jsonify({'error': str(exc)}), 400

        existing_schedules = []
        branch_schedules = AgeSchedule.query.filter_by(
            age_group=normalized_age_group,
            time=data['time'],
            end_time=end_time,  # РЈС‡РёС‚С‹РІР°РµРј end_time
            branch_id=int(data['branch_id'])
        ).all()
        
        for schedule in branch_schedules:
            schedule_days = schedule.days_of_week
            if isinstance(schedule_days, str):
                try:
                    schedule_days = json.loads(schedule_days)
                except:
                    schedule_days = []
            elif schedule_days is None:
                schedule_days = []
            
            # РџСЂРѕРІРµСЂСЏРµРј РїРµСЂРµСЃРµС‡РµРЅРёРµ РґРЅРµР№
            common_days = set(days_list) & set(schedule_days)
            if common_days:
                day_names = ['РџРЅ', 'Р’С‚', 'РЎСЂ', 'Р§С‚', 'РџС‚', 'РЎР±', 'Р’СЃ']
                common_day_names = [day_names[d] for d in common_days if 0 <= d <= 6]
                existing_schedules.append({
                    'id': schedule.id,
                    'common_days': list(common_days),
                    'common_day_names': common_day_names
                })
        
        if existing_schedules:
            error_messages = []
            for conflict in existing_schedules:
                error_messages.append(f"Р”РЅРё {', '.join(conflict['common_day_names'])} (ID СЂР°СЃРїРёСЃР°РЅРёСЏ: {conflict['id']})")
            
            return jsonify({
                'success': False,
                'error': 'Р§Р°СЃС‚СЊ РґРЅРµР№ СѓР¶Рµ Р·Р°РЅСЏС‚Р° РІ СЃСѓС‰РµСЃС‚РІСѓСЋС‰РёС… СЂР°СЃРїРёСЃР°РЅРёСЏС…',
                'existing': existing_schedules,
                'message': 'РљРѕРЅС„Р»РёРєС‚СѓСЋС‰РёРµ РґРЅРё: ' + '; '.join(error_messages)
            }), 400
        
        # РЎРѕР·РґР°РµРј РѕРґРЅРѕ СЂР°СЃРїРёСЃР°РЅРёРµ СЃРѕ РІСЃРµРјРё РґРЅСЏРјРё
        schedule = AgeSchedule(
            age_group=normalized_age_group,
            days_of_week=days_list,
            time=data['time'],
            end_time=end_time,  # Р”РѕР±Р°РІР»РµРЅРѕ
            branch_id=int(data['branch_id']),
            capacity=int(data.get('capacity', 10)),
            instructor=data.get('instructor', ''),
            is_active=bool(data.get('is_active', True))
        )
        
        db.session.add(schedule)
        db.session.commit()
        
        logger.info(f"вњ… РЎРѕР·РґР°РЅРѕ СЂР°СЃРїРёСЃР°РЅРёРµ РґР»СЏ РІРѕР·СЂР°СЃС‚РЅРѕР№ РіСЂСѓРїРїС‹ {data['age_group']} РЅР° РґРЅРё: {days_list} ({data['time']} - {end_time})")
        
        # РџРѕР»СѓС‡Р°РµРј РѕС‚РѕР±СЂР°Р¶Р°РµРјС‹Рµ РЅР°Р·РІР°РЅРёСЏ РґРЅРµР№ РґР»СЏ РѕС‚РІРµС‚Р°
        day_names = ['РџРЅ', 'Р’С‚', 'РЎСЂ', 'Р§С‚', 'РџС‚', 'РЎР±', 'Р’СЃ']
        display_days = [day_names[d] for d in days_list if 0 <= d <= 6]
        
        return jsonify({
            'success': True,
            'message': f'Р Р°СЃРїРёСЃР°РЅРёРµ СЃРѕР·РґР°РЅРѕ РЅР° РґРЅРё: {", ".join(display_days)}',
            'schedule': {
                'id': schedule.id,
                'age_group': schedule.age_group,
                'days_of_week': schedule.days_of_week,
                'days_display': display_days,
                'time': schedule.time,
                'end_time': schedule.end_time,  # Р”РѕР±Р°РІР»РµРЅРѕ
                'instructor': schedule.instructor
            }
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"вќЊ РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ СЂР°СЃРїРёСЃР°РЅРёСЏ: {str(e)}")
        return jsonify({'error': f'РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ СЂР°СЃРїРёСЃР°РЅРёСЏ: {str(e)}'}), 500

@bp.route('/age-schedules/<int:schedule_id>', methods=['PUT'])
@admin_required
def update_age_schedule(schedule_id):
    """РћР±РЅРѕРІР»РµРЅРёРµ СЂР°СЃРїРёСЃР°РЅРёСЏ"""
    try:
        data = request.get_json()
        schedule = AgeSchedule.query.get(schedule_id)
        
        if not schedule:
            return jsonify({'error': 'Р Р°СЃРїРёСЃР°РЅРёРµ РЅРµ РЅР°Р№РґРµРЅРѕ'}), 404
        
        # Р’Р°Р»РёРґР°С†РёСЏ РІСЂРµРјРµРЅРё РѕРєРѕРЅС‡Р°РЅРёСЏ, РµСЃР»Рё РѕР±РЅРѕРІР»СЏРµС‚СЃСЏ
        if 'time' in data or 'end_time' in data:
            start_time = data.get('time', schedule.time)
            end_time = data.get('end_time', schedule.end_time)
            
            try:
                start_h, start_m = map(int, start_time.split(':'))
                end_h, end_m = map(int, end_time.split(':'))
                
                start_minutes = start_h * 60 + start_m
                end_minutes = end_h * 60 + end_m
                
                if end_minutes <= start_minutes:
                    return jsonify({'error': 'Р’СЂРµРјСЏ РѕРєРѕРЅС‡Р°РЅРёСЏ РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РїРѕР·Р¶Рµ РІСЂРµРјРµРЅРё РЅР°С‡Р°Р»Р°'}), 400
                    
            except ValueError:
                return jsonify({'error': 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ С„РѕСЂРјР°С‚ РІСЂРµРјРµРЅРё. РСЃРїРѕР»СЊР·СѓР№С‚Рµ HH:MM'}), 400
        
        # РћР±РЅРѕРІР»СЏРµРј РґРЅРё РЅРµРґРµР»Рё (РµСЃР»Рё РїСЂРµРґРѕСЃС‚Р°РІР»РµРЅС‹)
        normalized_age_group = schedule.age_group
        if 'age_group' in data:
            try:
                normalized_age_group = normalize_schedule_age_group(
                    data,
                    fallback=schedule.age_group,
                )
            except ValueError as exc:
                return jsonify({'error': str(exc)}), 400

        if 'days_of_week' in data:
            days_list = data['days_of_week']
            if not isinstance(days_list, list):
                return jsonify({'error': 'days_of_week РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ СЃРїРёСЃРєРѕРј'}), 400
            
            if len(days_list) == 0:
                return jsonify({'error': 'Р’С‹Р±РµСЂРёС‚Рµ С…РѕС‚СЏ Р±С‹ РѕРґРёРЅ РґРµРЅСЊ'}), 400
            
            # РџСЂРѕРІРµСЂСЏРµРј, С‡С‚Рѕ РІСЃРµ РґРЅРё РІ РїСЂР°РІРёР»СЊРЅРѕРј РґРёР°РїР°Р·РѕРЅРµ
            for day in days_list:
                if not isinstance(day, int) or day < 0 or day > 6:
                    return jsonify({'error': f'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РґРµРЅСЊ РЅРµРґРµР»Рё: {day}'}), 400
            
            # РџСЂРѕРІРµСЂСЏРµРј, РЅРµС‚ Р»Рё РєРѕРЅС„Р»РёРєС‚РѕРІ СЃ РґСЂСѓРіРёРјРё СЂР°СЃРїРёСЃР°РЅРёСЏРјРё (РєСЂРѕРјРµ С‚РµРєСѓС‰РµРіРѕ)
            other_schedules = AgeSchedule.query.filter(
                AgeSchedule.id != schedule_id,
                AgeSchedule.age_group == normalized_age_group,
                AgeSchedule.time == schedule.time,
                AgeSchedule.end_time == schedule.end_time,  # РЈС‡РёС‚С‹РІР°РµРј end_time
                AgeSchedule.branch_id == schedule.branch_id
            ).all()
            
            conflicts = []
            for other_schedule in other_schedules:
                other_days = other_schedule.days_of_week
                if isinstance(other_days, str):
                    try:
                        other_days = json.loads(other_days)
                    except:
                        other_days = []
                elif other_days is None:
                    other_days = []
                
                common_days = set(days_list) & set(other_days)
                if common_days:
                    day_names = ['РџРЅ', 'Р’С‚', 'РЎСЂ', 'Р§С‚', 'РџС‚', 'РЎР±', 'Р’СЃ']
                    common_day_names = [day_names[d] for d in common_days if 0 <= d <= 6]
                    conflicts.append({
                        'id': other_schedule.id,
                        'common_days': list(common_days),
                        'common_day_names': common_day_names
                    })
            
            if conflicts:
                error_messages = []
                for conflict in conflicts:
                    error_messages.append(f"Р”РЅРё {', '.join(conflict['common_day_names'])} (ID СЂР°СЃРїРёСЃР°РЅРёСЏ: {conflict['id']})")
                
                return jsonify({
                    'success': False,
                    'error': 'Р§Р°СЃС‚СЊ РґРЅРµР№ СѓР¶Рµ Р·Р°РЅСЏС‚Р° РІ РґСЂСѓРіРёС… СЂР°СЃРїРёСЃР°РЅРёСЏС…',
                    'conflicts': conflicts,
                    'message': 'РљРѕРЅС„Р»РёРєС‚СѓСЋС‰РёРµ РґРЅРё: ' + '; '.join(error_messages)
                }), 400
            
            schedule.days_of_week = days_list
        
        # РћР±РЅРѕРІР»СЏРµРј РѕСЃС‚Р°Р»СЊРЅС‹Рµ РїРѕР»СЏ
        if 'age_group' in data:
            schedule.age_group = normalized_age_group
        if 'time' in data:
            schedule.time = data['time']
        if 'end_time' in data:  # Р”РѕР±Р°РІР»РµРЅРѕ
            schedule.end_time = data['end_time']
        if 'branch_id' in data:
            schedule.branch_id = int(data['branch_id'])
        if 'capacity' in data:
            schedule.capacity = int(data['capacity'])
        if 'instructor' in data:
            schedule.instructor = data['instructor']
        if 'is_active' in data:
            schedule.is_active = bool(data['is_active'])
        
        db.session.commit()
        
        # РџРѕР»СѓС‡Р°РµРј РѕР±РЅРѕРІР»РµРЅРЅС‹Рµ РґР°РЅРЅС‹Рµ РґР»СЏ РѕС‚РІРµС‚Р°
        days_list = schedule.days_of_week
        if isinstance(days_list, str):
            try:
                days_list = json.loads(days_list)
            except:
                days_list = []
        
        day_names = ['РџРЅ', 'Р’С‚', 'РЎСЂ', 'Р§С‚', 'РџС‚', 'РЎР±', 'Р’СЃ']
        display_days = [day_names[d] for d in days_list if 0 <= d <= 6]
        
        return jsonify({
            'success': True,
            'message': f'Р Р°СЃРїРёСЃР°РЅРёРµ РѕР±РЅРѕРІР»РµРЅРѕ. Р”РЅРё: {", ".join(display_days)}'
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"вќЊ РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ СЂР°СЃРїРёСЃР°РЅРёСЏ: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ СЂР°СЃРїРёСЃР°РЅРёСЏ'}), 500

@bp.route('/age-schedules/<int:schedule_id>', methods=['DELETE'])
@admin_required
def delete_age_schedule(schedule_id):
    """РЈРґР°Р»РµРЅРёРµ СЂР°СЃРїРёСЃР°РЅРёСЏ"""
    try:
        schedule = AgeSchedule.query.get(schedule_id)
        
        if not schedule:
            return jsonify({'error': 'Р Р°СЃРїРёСЃР°РЅРёРµ РЅРµ РЅР°Р№РґРµРЅРѕ'}), 404
        
        # РџСЂРѕРІРµСЂСЏРµРј, РЅРµС‚ Р»Рё Р·Р°РїРёСЃРµР№ СЃ СЌС‚РёРј СЂР°СЃРїРёСЃР°РЅРёРµРј
        attendance_count = Attendance.query.filter_by(
            schedule_id=schedule_id
        ).count()
        
        if attendance_count > 0:
            return jsonify({
                'error': f'РќРµР»СЊР·СЏ СѓРґР°Р»РёС‚СЊ СЂР°СЃРїРёСЃР°РЅРёРµ. Р•СЃС‚СЊ {attendance_count} Р·Р°РїРёСЃРµР№ РїРѕСЃРµС‰РµРЅРёР№'
            }), 400
        
        db.session.delete(schedule)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Р Р°СЃРїРёСЃР°РЅРёРµ СѓРґР°Р»РµРЅРѕ'
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"вќЊ РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ СЂР°СЃРїРёСЃР°РЅРёСЏ: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ СЂР°СЃРїРёСЃР°РЅРёСЏ'}), 500

# ========== API Р”Р›РЇ Р’РђР›РР”РђР¦РР Р РђРЎРџРРЎРђРќРРЇ ==========

@bp.route('/age-schedules/validate', methods=['POST'])
@admin_required
def validate_schedule():
    """Р’Р°Р»РёРґР°С†РёСЏ РЅРѕРІРѕРіРѕ СЂР°СЃРїРёСЃР°РЅРёСЏ РїРµСЂРµРґ СЃРѕР·РґР°РЅРёРµРј"""
    try:
        data = request.get_json()
        
        required_fields = ['age_group', 'days_of_week', 'time', 'end_time', 'branch_id']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'valid': False,
                    'error': f'РћС‚СЃСѓС‚СЃС‚РІСѓРµС‚ РїРѕР»Рµ: {field}',
                    'field': field
                }), 400
        
        # РџСЂРѕРІРµСЂСЏРµРј, С‡С‚Рѕ days_of_week СЌС‚Рѕ СЃРїРёСЃРѕРє
        days_list = data['days_of_week']
        if not isinstance(days_list, list):
            return jsonify({
                'valid': False,
                'error': 'days_of_week РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ СЃРїРёСЃРєРѕРј',
                'field': 'days_of_week'
            }), 400
        
        if len(days_list) == 0:
            return jsonify({
                'valid': False,
                'error': 'Р’С‹Р±РµСЂРёС‚Рµ С…РѕС‚СЏ Р±С‹ РѕРґРёРЅ РґРµРЅСЊ',
                'field': 'days_of_week'
            }), 400
        
        # РџСЂРѕРІРµСЂСЏРµРј РґРёР°РїР°Р·РѕРЅ РґРЅРµР№
        for day in days_list:
            if not isinstance(day, int) or day < 0 or day > 6:
                return jsonify({
                    'valid': False,
                    'error': f'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РґРµРЅСЊ РЅРµРґРµР»Рё: {day}',
                    'field': 'days_of_week'
                }), 400
        
        # РџСЂРѕРІРµСЂРєР° С„РѕСЂРјР°С‚Р° РІСЂРµРјРµРЅРё
        try:
            start_h, start_m = map(int, data['time'].split(':'))
            end_h, end_m = map(int, data['end_time'].split(':'))
            
            # РџСЂРѕРІРµСЂРєР°, С‡С‚Рѕ РІСЂРµРјСЏ РѕРєРѕРЅС‡Р°РЅРёСЏ РїРѕР·Р¶Рµ РІСЂРµРјРµРЅРё РЅР°С‡Р°Р»Р°
            start_minutes = start_h * 60 + start_m
            end_minutes = end_h * 60 + end_m
            
            if end_minutes <= start_minutes:
                return jsonify({
                    'valid': False,
                    'error': 'Р’СЂРµРјСЏ РѕРєРѕРЅС‡Р°РЅРёСЏ РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РїРѕР·Р¶Рµ РІСЂРµРјРµРЅРё РЅР°С‡Р°Р»Р°',
                    'field': 'end_time'
                }), 400
                
        except ValueError:
            return jsonify({
                'valid': False,
                'error': 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ С„РѕСЂРјР°С‚ РІСЂРµРјРµРЅРё. РСЃРїРѕР»СЊР·СѓР№С‚Рµ HH:MM',
                'field': 'time'
            }), 400
        
        # РџСЂРѕРІРµСЂСЏРµРј, РЅРµС‚ Р»Рё РєРѕРЅС„Р»РёРєС‚РѕРІ
        try:
            normalized_age_group = normalize_schedule_age_group(data)
        except ValueError as exc:
            return jsonify({
                'valid': False,
                'error': str(exc),
                'field': 'age_group'
            }), 400

        existing_schedules = AgeSchedule.query.filter_by(
            age_group=normalized_age_group,
            time=data['time'],
            end_time=data['end_time'],
            branch_id=int(data['branch_id'])
        ).all()
        
        conflicts = []
        for schedule in existing_schedules:
            schedule_days = schedule.days_of_week
            if isinstance(schedule_days, str):
                try:
                    schedule_days = json.loads(schedule_days)
                except:
                    schedule_days = []
            elif schedule_days is None:
                schedule_days = []
            
            common_days = set(days_list) & set(schedule_days)
            if common_days:
                day_names = ['РџРЅ', 'Р’С‚', 'РЎСЂ', 'Р§С‚', 'РџС‚', 'РЎР±', 'Р’СЃ']
                common_day_names = [day_names[d] for d in common_days if 0 <= d <= 6]
                conflicts.append({
                    'schedule_id': schedule.id,
                    'common_days': list(common_days),
                    'common_day_names': common_day_names
                })
        
        if conflicts:
            return jsonify({
                'valid': False,
                'error': 'РљРѕРЅС„Р»РёРєС‚С‹ СЃ СЃСѓС‰РµСЃС‚РІСѓСЋС‰РёРјРё СЂР°СЃРїРёСЃР°РЅРёСЏРјРё',
                'conflicts': conflicts
            }), 400
        
        # РџСЂРѕРІРµСЂСЏРµРј С„РёР»РёР°Р»
        branch = Branch.query.get(int(data['branch_id']))
        if not branch:
            return jsonify({
                'valid': False,
                'error': 'Р¤РёР»РёР°Р» РЅРµ РЅР°Р№РґРµРЅ',
                'field': 'branch_id'
            }), 400
        
        # РџРѕР»СѓС‡Р°РµРј РѕС‚РѕР±СЂР°Р¶Р°РµРјС‹Рµ РЅР°Р·РІР°РЅРёСЏ РґРЅРµР№
        day_names = ['РџРЅ', 'Р’С‚', 'РЎСЂ', 'Р§С‚', 'РџС‚', 'РЎР±', 'Р’СЃ']
        display_days = [day_names[d] for d in days_list if 0 <= d <= 6]
        
        return jsonify({
            'valid': True,
            'message': f'Р Р°СЃРїРёСЃР°РЅРёРµ РІР°Р»РёРґРЅРѕ. Р”РЅРё: {", ".join(display_days)}',
            'branch_name': branch.name
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РІР°Р»РёРґР°С†РёРё СЂР°СЃРїРёСЃР°РЅРёСЏ: {str(e)}")
        return jsonify({
            'valid': False,
            'error': f'РћС€РёР±РєР° РІР°Р»РёРґР°С†РёРё: {str(e)}'
        }), 500

# ========== API Р”Р›РЇ РћРўРњР•РўРљР РџРћРЎР•Р©Р•РќРР™ ==========

@bp.route('/attendance/<int:attendance_id>', methods=['PUT'])
@admin_required
def update_attendance_status(attendance_id):
    """РћР±РЅРѕРІР»РµРЅРёРµ СЃС‚Р°С‚СѓСЃР° РїРѕСЃРµС‰РµРЅРёСЏ (РѕС‚РјРµС‚РєР° РїСЂРёСЃСѓС‚СЃС‚РІРёСЏ/РѕС‚СЃСѓС‚СЃС‚РІРёСЏ)"""
    try:
        data = request.get_json()
        attendance = Attendance.query.get(attendance_id)
        
        if not attendance:
            return jsonify({'error': 'Р—Р°РїРёСЃСЊ РїРѕСЃРµС‰РµРЅРёСЏ РЅРµ РЅР°Р№РґРµРЅР°'}), 404

        old_status = attendance.status
        allowed_statuses = {'scheduled', 'attended', 'missed', 'cancelled', 'rescheduled'}

        # РћР±РЅРѕРІР»СЏРµРј СЃС‚Р°С‚СѓСЃ
        if 'status' in data:
            if data['status'] not in allowed_statuses:
                return jsonify({'error': 'РќРµРґРѕРїСѓСЃС‚РёРјС‹Р№ СЃС‚Р°С‚СѓСЃ РїРѕСЃРµС‰РµРЅРёСЏ'}), 400
            attendance.status = data['status']

        if 'notes' in data:
            attendance.notes = data['notes']

        attendance.actual_date = datetime.utcnow() if attendance.status == 'attended' else None

        payment = Payment.query.get(attendance.payment_id) if attendance.payment_id else None
        if payment:
            sync_payment_counters(payment)

        db.session.commit()
        
        # РџРѕР»СѓС‡Р°РµРј РѕР±РЅРѕРІР»РµРЅРЅС‹Рµ РґР°РЅРЅС‹Рµ РґР»СЏ РѕС‚РІРµС‚Р°
        user = User.query.get(attendance.user_id)
        child_name = "РќРµРёР·РІРµСЃС‚РЅРѕ"
        if user and user.children:
            for child in user.children:
                if child.get('id') == attendance.child_id:
                    child_name = child.get('name', 'РќРµРёР·РІРµСЃС‚РЅРѕ')
                    break
        
        return jsonify({
            'success': True,
            'message': 'РЎС‚Р°С‚СѓСЃ РїРѕСЃРµС‰РµРЅРёСЏ РѕР±РЅРѕРІР»РµРЅ',
            'attendance': {
                'id': attendance.id,
                'status': attendance.status,
                'notes': attendance.notes,
                'actual_date': attendance.actual_date.isoformat() if attendance.actual_date else None,
                'child_name': child_name,
                'payment_info': {
                    'remaining_trainings': payment.remaining_trainings if payment else None,
                    'used_trainings': payment.used_trainings if payment else None
                }
            }
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"вќЊ РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ РїРѕСЃРµС‰РµРЅРёСЏ: {str(e)}")
        return jsonify({'error': f'РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ РїРѕСЃРµС‰РµРЅРёСЏ: {str(e)}'}), 500


@bp.route('/attendance/bulk-mark', methods=['POST'])
@admin_required
def bulk_mark_attendance():
    """РњР°СЃСЃРѕРІР°СЏ РѕС‚РјРµС‚РєР° РїРѕСЃРµС‰РµРЅРёР№"""
    try:
        data = request.get_json()
        
        if not data.get('attendance_ids') or not data.get('status'):
            return jsonify({'error': 'РќРµ СѓРєР°Р·Р°РЅС‹ ID Р·Р°РїРёСЃРµР№ РёР»Рё СЃС‚Р°С‚СѓСЃ'}), 400
        
        attendance_ids = data['attendance_ids']
        status = data['status']
        notes = data.get('notes', '')
        allowed_statuses = {'scheduled', 'attended', 'missed', 'cancelled', 'rescheduled'}

        if status not in allowed_statuses:
            return jsonify({'error': 'РќРµРґРѕРїСѓСЃС‚РёРјС‹Р№ СЃС‚Р°С‚СѓСЃ РїРѕСЃРµС‰РµРЅРёСЏ'}), 400
        
        updated_count = 0
        failed_count = 0
        results = []
        touched_payment_ids = set()
        
        for attendance_id in attendance_ids:
            try:
                attendance = Attendance.query.get(attendance_id)
                if not attendance:
                    results.append({
                        'id': attendance_id,
                        'success': False,
                        'error': 'Р—Р°РїРёСЃСЊ РЅРµ РЅР°Р№РґРµРЅР°'
                    })
                    failed_count += 1
                    continue
                
                old_status = attendance.status
                attendance.status = status
                
                if notes:
                    attendance.notes = notes

                attendance.actual_date = datetime.utcnow() if status == 'attended' else None
                if attendance.payment_id:
                    touched_payment_ids.add(attendance.payment_id)
                
                # РџРѕР»СѓС‡Р°РµРј РёРјСЏ СЂРµР±РµРЅРєР° РґР»СЏ РѕС‚РІРµС‚Р°
                user = User.query.get(attendance.user_id)
                child_name = "РќРµРёР·РІРµСЃС‚РЅРѕ"
                if user and user.children:
                    for child in user.children:
                        if child.get('id') == attendance.child_id:
                            child_name = child.get('name', 'РќРµРёР·РІРµСЃС‚РЅРѕ')
                            break
                
                results.append({
                    'id': attendance_id,
                    'success': True,
                    'child_name': child_name,
                    'old_status': old_status,
                    'new_status': status
                })
                updated_count += 1
                
            except Exception as e:
                results.append({
                    'id': attendance_id,
                    'success': False,
                    'error': str(e)
                })
                failed_count += 1

        for payment_id in touched_payment_ids:
            payment = Payment.query.get(payment_id)
            if payment:
                sync_payment_counters(payment)

        db.session.commit()
        
        logger.info(f"вњ… РњР°СЃСЃРѕРІР°СЏ РѕС‚РјРµС‚РєР°: РѕР±РЅРѕРІР»РµРЅРѕ {updated_count}, РЅРµ СѓРґР°Р»РѕСЃСЊ {failed_count}")
        
        return jsonify({
            'success': True,
            'message': f'РћР±РЅРѕРІР»РµРЅРѕ {updated_count} РёР· {len(attendance_ids)} Р·Р°РїРёСЃРµР№',
            'updated_count': updated_count,
            'failed_count': failed_count,
            'results': results
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"вќЊ РћС€РёР±РєР° РјР°СЃСЃРѕРІРѕР№ РѕС‚РјРµС‚РєРё РїРѕСЃРµС‰РµРЅРёР№: {str(e)}")
        return jsonify({'error': f'РћС€РёР±РєР° РјР°СЃСЃРѕРІРѕР№ РѕС‚РјРµС‚РєРё: {str(e)}'}), 500

# ========== API Р”Р›РЇ РџРћР›Р¬Р—РћР’РђРўР•Р›Р•Р™ ==========

@bp.route('/users', methods=['GET'])
@admin_required
def get_all_users():
    """РџРѕР»СѓС‡РµРЅРёРµ СЃРїРёСЃРєР° РІСЃРµС… РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№ СЃРёСЃС‚РµРјС‹"""
    try:
        logger.info("рџ“Ґ Р—Р°РїСЂРѕСЃ СЃРїРёСЃРєР° РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№ РѕС‚ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР°")
        
        users = User.query.filter(User.id != 0).order_by(User.registered_at.desc()).all()
        
        users_data = []
        for user in users:
            payments_count = Payment.query.filter_by(user_id=user.id).count()
            attendance_count = Attendance.query.filter_by(user_id=user.id).count()
            applications_count = Application.query.filter_by(user_id=user.id).count()
            
            children = []
            if user.children:
                if isinstance(user.children, list):
                    children = user.children
                elif isinstance(user.children, str):
                    try:
                        children = json.loads(user.children)
                    except:
                        children = []
            
            # Р Р°СЃСЃС‡РёС‚С‹РІР°РµРј СЃС‚Р°С‚РёСЃС‚РёРєСѓ
            stats = {
                'payments': payments_count,
                'attendance': attendance_count,
                'applications': applications_count,
                'children_count': len(children)
            }
            
            users_data.append({
                'id': user.id,
                'name': user.name,
                'email': user.email,
                'phone': user.phone,
                'children': children,
                'registered_at': user.registered_at.isoformat() if user.registered_at else None,
                'stats': stats
            })
        
        logger.info(f"вњ… РќР°Р№РґРµРЅРѕ {len(users_data)} РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№ РґР»СЏ Р°РґРјРёРЅ-РїР°РЅРµР»Рё")
        
        return jsonify({
            'success': True,
            'users': users_data
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№: {str(e)}")
        return jsonify({'error': f'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№: {str(e)}'}), 500

@bp.route('/users', methods=['POST'])
@admin_required
def create_user():
    try:
        data = request.get_json() or {}

        name = str(data.get('name') or '').strip()
        email = str(data.get('email') or '').strip().lower()
        phone = str(data.get('phone') or '').strip()
        password = str(data.get('password') or '')

        if not name:
            return jsonify({'error': 'РЈРєР°Р¶РёС‚Рµ РёРјСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ'}), 400
        if not email:
            return jsonify({'error': 'РЈРєР°Р¶РёС‚Рµ email'}), 400
        if not password:
            return jsonify({'error': 'РЈРєР°Р¶РёС‚Рµ РїР°СЂРѕР»СЊ'}), 400

        existing_user = User.query.filter_by(email=email).first()
        if existing_user:
            return jsonify({'error': 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЃ С‚Р°РєРёРј email СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚'}), 409

        user = User(
            name=name,
            email=email,
            phone=phone,
            password_hash=hash_password(password),
            children=[],
        )
        db.session.add(user)
        db.session.flush()

        user.children = normalize_children_payload(data.get('children', []), user.id)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЃРѕР·РґР°РЅ',
            'user': serialize_user_for_admin(user, include_stats=True),
        }), 201
    except ValueError as exc:
        db.session.rollback()
        return jsonify({'error': str(exc)}), 400
    except Exception as e:
        db.session.rollback()
        logger.error(f"РІСњРЉ РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ'}), 500


@bp.route('/users/<int:user_id>', methods=['PUT'])
@admin_required
def update_user(user_id):
    try:
        user = User.query.get(user_id)
        if not user or user.id == 0:
            return jsonify({'error': 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ'}), 404

        data = request.get_json() or {}
        name = str(data.get('name') or user.name or '').strip()
        email = str(data.get('email') or user.email or '').strip().lower()
        phone = str(data.get('phone') or '').strip()
        password = data.get('password')

        if not name:
            return jsonify({'error': 'РЈРєР°Р¶РёС‚Рµ РёРјСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ'}), 400
        if not email:
            return jsonify({'error': 'РЈРєР°Р¶РёС‚Рµ email'}), 400

        existing_user = User.query.filter(User.email == email, User.id != user_id).first()
        if existing_user:
            return jsonify({'error': 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЃ С‚Р°РєРёРј email СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚'}), 409

        user.name = name
        user.email = email
        user.phone = phone

        if isinstance(password, str) and password.strip():
            user.password_hash = hash_password(password)

        if 'children' in data:
            user.children = normalize_children_payload(data.get('children', []), user.id)

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РѕР±РЅРѕРІР»РµРЅ',
            'user': serialize_user_for_admin(user, include_stats=True),
        })
    except ValueError as exc:
        db.session.rollback()
        return jsonify({'error': str(exc)}), 400
    except Exception as e:
        db.session.rollback()
        logger.error(f"РІСњРЉ РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ'}), 500


@bp.route('/user/<int:user_id>', methods=['GET'])
@admin_required
def get_user_details(user_id):
    """РџРѕР»СѓС‡РµРЅРёРµ РґРµС‚Р°Р»СЊРЅРѕР№ РёРЅС„РѕСЂРјР°С†РёРё Рѕ РїРѕР»СЊР·РѕРІР°С‚РµР»Рµ"""
    try:
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ'}), 404
        
        user_payments = Payment.query.filter_by(user_id=user_id).order_by(Payment.created_at.desc()).all()
        payments_data = []
        for payment in user_payments:
            branch = Branch.query.get(payment.branch_id) if payment.branch_id else None
            payments_data.append({
                'id': payment.id,
                'amount': payment.amount,
                'training_count': payment.training_count,
                'used_trainings': payment.used_trainings,
                'remaining_trainings': payment.remaining_trainings,
                'start_date': payment.start_date.isoformat() if payment.start_date else None,
                'end_date': payment.end_date.isoformat() if payment.end_date else None,
                'branch_id': payment.branch_id,
                'branch_name': branch.name if branch else 'РќРµ СѓРєР°Р·Р°РЅ',
                'status': payment.status,
                'payment_method': payment.payment_method,
                'created_at': payment.created_at.isoformat() if payment.created_at else None
            })
        
        user_attendance = Attendance.query.filter_by(user_id=user_id).order_by(Attendance.scheduled_date.desc()).all()
        attendance_data = []
        for record in user_attendance:
            branch = Branch.query.get(record.branch_id) if record.branch_id else None
            attendance_data.append({
                'id': record.id,
                'child_id': record.child_id,
                'payment_id': record.payment_id,
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
        
        children = []
        if user.children:
            if isinstance(user.children, list):
                children = user.children
            elif isinstance(user.children, str):
                try:
                    children = json.loads(user.children)
                except:
                    children = []
        
        logger.info(f"вњ… РџРѕР»СѓС‡РµРЅС‹ РґРµС‚Р°Р»Рё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ {user_id}")
        
        return jsonify({
            'success': True,
            'user': {
                'id': user.id,
                'name': user.name,
                'email': user.email,
                'phone': user.phone,
                'registered_at': user.registered_at.isoformat() if user.registered_at else None,
                'children': children
            },
            'payments': payments_data,
            'attendance': attendance_data
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РґРµС‚Р°Р»РµР№ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РґР°РЅРЅС‹С… РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ'}), 500

# ========== API Р”Р›РЇ РћРџР›РђРў ==========

@bp.route('/payments', methods=['GET'])
@admin_required
def get_all_payments():
    """РџРѕР»СѓС‡РµРЅРёРµ РІСЃРµС… РїР»Р°С‚РµР¶РµР№"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        
        query = Payment.query
        
        # Р¤РёР»СЊС‚СЂС‹
        status = request.args.get('status')
        user_id = request.args.get('user_id')
        branch_id = request.args.get('branch_id')
        
        if status and status != 'all':
            query = query.filter_by(status=status)
        if user_id and user_id != 'all':
            query = query.filter_by(user_id=int(user_id))
        if branch_id and branch_id != 'all':
            query = query.filter_by(branch_id=int(branch_id))
        
        payments = query.order_by(Payment.created_at.desc()).paginate(
            page=page, per_page=per_page, error_out=False
        )
        
        payments_data = []
        for payment in payments.items:
            user = User.query.get(payment.user_id)
            branch = Branch.query.get(payment.branch_id) if payment.branch_id else None
            
            # РџРѕР»СѓС‡Р°РµРј РёРјСЏ СЂРµР±РµРЅРєР°
            child_name = "РќРµРёР·РІРµСЃС‚РЅРѕ"
            if user and user.children:
                for child in user.children:
                    if child.get('id') == payment.child_id:
                        child_name = child.get('name', 'РќРµРёР·РІРµСЃС‚РЅРѕ')
                        break
            
            payments_data.append({
                'id': payment.id,
                'user_id': payment.user_id,
                'user_name': user.name if user else 'РќРµРёР·РІРµСЃС‚РЅРѕ',
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
            'payments': payments_data,
            'pagination': {
                'page': payments.page,
                'per_page': payments.per_page,
                'total': payments.total,
                'pages': payments.pages
            }
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РїР»Р°С‚РµР¶РµР№: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РїР»Р°С‚РµР¶РµР№'}), 500

@bp.route('/payments/<int:payment_id>', methods=['PUT'])
@admin_required
def update_payment(payment_id):
    """РћР±РЅРѕРІР»РµРЅРёРµ РїР»Р°С‚РµР¶Р° (РїРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ Рё СЃРѕР·РґР°РЅРёРµ РїРѕСЃРµС‰РµРЅРёР№)"""
    try:
        data = request.get_json()
        payment = Payment.query.get(payment_id)

        if not payment:
            return jsonify({'error': 'РџР»Р°С‚РµР¶ РЅРµ РЅР°Р№РґРµРЅ'}), 404

        old_status = payment.status
        allowed_statuses = {'pending', 'confirmed', 'failed'}

        if 'status' in data:
            if data['status'] not in allowed_statuses:
                return jsonify({'error': 'РќРµРґРѕРїСѓСЃС‚РёРјС‹Р№ СЃС‚Р°С‚СѓСЃ РїР»Р°С‚РµР¶Р°'}), 400
            payment.status = data['status']

        if 'amount' in data:
            payment.amount = int(data['amount'])
        if 'training_count' in data:
            payment.training_count = int(data['training_count'])
        if 'used_trainings' in data:
            payment.used_trainings = int(data['used_trainings'])
        if 'remaining_trainings' in data:
            payment.remaining_trainings = int(data['remaining_trainings'])
        if 'payment_method' in data:
            payment.payment_method = data['payment_method']
        if 'transaction_id' in data:
            payment.transaction_id = data['transaction_id']

        if old_status == 'confirmed' and payment.status != 'confirmed':
            removed_count = remove_payment_attendance_records(payment)
            payment.used_trainings = 0
            payment.remaining_trainings = payment.training_count
            logger.info(
                f"РџРѕ РѕРїР»Р°С‚Рµ {payment.id} СѓРґР°Р»РµРЅРѕ {removed_count} Р·Р°РїР»Р°РЅРёСЂРѕРІР°РЅРЅС‹С… РїРѕСЃРµС‰РµРЅРёР№ РїСЂРё СЃРЅСЏС‚РёРё РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ"
            )
        elif payment.status != 'confirmed':
            payment.used_trainings = 0
            payment.remaining_trainings = payment.training_count

        if old_status != 'confirmed' and payment.status == 'confirmed':
            user = User.query.get(payment.user_id)
            if not user:
                return jsonify({'error': 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РґР»СЏ РѕРїР»Р°С‚С‹ РЅРµ РЅР°Р№РґРµРЅ'}), 404

            existing_attendance_count = Attendance.query.filter_by(payment_id=payment.id).count()
            created_count = create_payment_attendance_records(payment, user)

            if existing_attendance_count == 0 and created_count == 0:
                return jsonify({
                    'error': 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ Р·Р°РЅСЏС‚РёСЏ РїРѕ СЌС‚РѕР№ РѕРїР»Р°С‚Рµ. РџСЂРѕРІРµСЂСЊС‚Рµ С„РёР»РёР°Р», СЂР°СЃРїРёСЃР°РЅРёРµ Рё РґР°РЅРЅС‹Рµ СЂРµР±РµРЅРєР°.'
                }), 400

            sync_payment_counters(payment)
            logger.info(
                f"РџРѕРґС‚РІРµСЂР¶РґРµРЅ РїР»Р°С‚РµР¶ {payment.id}. РЎРѕР·РґР°РЅРѕ Р·Р°РЅСЏС‚РёР№: {created_count}, РІСЃРµРіРѕ Р·Р°РїРёСЃРµР№: "
                f"{Attendance.query.filter_by(payment_id=payment.id).count()}"
            )

        if payment.status == 'confirmed':
            sync_payment_counters(payment)

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'РџР»Р°С‚РµР¶ РѕР±РЅРѕРІР»РµРЅ',
            'payment': {
                'id': payment.id,
                'status': payment.status,
                'remaining_trainings': payment.remaining_trainings,
                'used_trainings': payment.used_trainings
            }
        })
    except ValueError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        db.session.rollback()
        logger.error(f"вќЊ РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ РїР»Р°С‚РµР¶Р°: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ РїР»Р°С‚РµР¶Р°'}), 500

@bp.route('/age-schedules/public', methods=['GET'])
@cross_origin()
def get_public_age_schedules():
    """РџРѕР»СѓС‡РµРЅРёРµ СЂР°СЃРїРёСЃР°РЅРёСЏ РґР»СЏ РїСѓР±Р»РёС‡РЅРѕР№ СЃС‚СЂР°РЅРёС†С‹ (СѓРїСЂРѕС‰РµРЅРЅРѕРµ)"""
    try:
        branch_id = request.args.get('branch_id')
        age_group = request.args.get('age_group')
        
        query = AgeSchedule.query.filter_by(is_active=True)
        
        if branch_id and branch_id != 'all':
            query = query.filter_by(branch_id=int(branch_id))
        
        if age_group and age_group != 'all':
            query = query.filter_by(age_group=age_group)
        
        schedules = query.order_by(
            AgeSchedule.branch_id,
            AgeSchedule.time
        ).all()
        
        # РџСЂРµРѕР±СЂР°Р·СѓРµРј РІ С„РѕСЂРјР°С‚ РґР»СЏ SchedulePage
        schedules_data = []
        for schedule in schedules:
            branch = Branch.query.get(schedule.branch_id)
            
            # РџРѕР»СѓС‡Р°РµРј РґРЅРё РЅРµРґРµР»Рё
            days_list = schedule.days_of_week
            if isinstance(days_list, str):
                try:
                    days_list = json.loads(days_list)
                except:
                    days_list = []
            elif days_list is None:
                days_list = []
            
            # РџСЂРµРѕР±СЂР°Р·СѓРµРј РґРЅРё РІ С„РѕСЂРјР°С‚ SchedulePage (mon, tue, wed Рё С‚.Рґ.)
            day_mapping = {
                0: "mon",  # РџРѕРЅРµРґРµР»СЊРЅРёРє
                1: "tue",  # Р’С‚РѕСЂРЅРёРє
                2: "wed",  # РЎСЂРµРґР°
                3: "thu",  # Р§РµС‚РІРµСЂРі
                4: "fri",  # РџСЏС‚РЅРёС†Р°
                5: "sat",  # РЎСѓР±Р±РѕС‚Р°
                6: "sun"   # Р’РѕСЃРєСЂРµСЃРµРЅСЊРµ
            }
            
            # РџРѕР»СѓС‡Р°РµРј РѕС‚РѕР±СЂР°Р¶Р°РµРјС‹Рµ РЅР°Р·РІР°РЅРёСЏ РґРЅРµР№
            day_names = ['РџРЅ', 'Р’С‚', 'РЎСЂ', 'Р§С‚', 'РџС‚', 'РЎР±', 'Р’СЃ']
            
            # РЎРѕР·РґР°РµРј Р·Р°РїРёСЃСЊ РґР»СЏ РєР°Р¶РґРѕРіРѕ РґРЅСЏ
            for day_num in days_list:
                day_key = day_mapping.get(day_num, "")
                if day_key:
                    schedules_data.append({
                        'day': day_key,
                        'day_short': day_names[day_num] if 0 <= day_num < 7 else '',
                        'time': schedule.time,
                        'endTime': schedule.end_time,  # Р”РћР‘РђР’Р›Р•РќРћ: РІСЂРµРјСЏ РѕРєРѕРЅС‡Р°РЅРёСЏ
                        'branch_id': schedule.branch_id,
                        'branch_code': f"branch_{schedule.branch_id}",
                        'ageGroup': schedule.age_group,
                        'coach': schedule.instructor or "РРЅСЃС‚СЂСѓРєС‚РѕСЂ",
                        'group': f"{schedule.age_group} РіСЂСѓРїРїР°",
                        'capacity': schedule.capacity,
                        'branch_name': branch.name if branch else "Р¤РёР»РёР°Р»"
                    })
        
        # Р“СЂСѓРїРїРёСЂСѓРµРј РїРѕ РґРЅСЋ Рё РІСЂРµРјРµРЅРё РґР»СЏ СѓРґРѕР±СЃС‚РІР°
        grouped_schedule = {}
        for schedule in schedules_data:
            day = schedule['day']
            time = schedule['time']
            
            if day not in grouped_schedule:
                grouped_schedule[day] = {}
            
            if time not in grouped_schedule[day]:
                grouped_schedule[day][time] = []
            
            grouped_schedule[day][time].append({
                'branch': schedule['branch_code'],
                'ageGroup': schedule['ageGroup'],
                'coach': schedule['coach'],
                'group': schedule['group'],
                'capacity': schedule['capacity'],
                'branch_name': schedule['branch_name'],
                'endTime': schedule['endTime']  # Р”РћР‘РђР’Р›Р•РќРћ: РІСЂРµРјСЏ РѕРєРѕРЅС‡Р°РЅРёСЏ
            })
        
        return jsonify({
            'success': True,
            'schedule': grouped_schedule,
            'last_updated': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РїСѓР±Р»РёС‡РЅРѕРіРѕ СЂР°СЃРїРёСЃР°РЅРёСЏ: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ СЂР°СЃРїРёСЃР°РЅРёСЏ'}), 500
    
@bp.route('/branches/public', methods=['GET'])
@cross_origin()
def get_public_branches():
    """РџРѕР»СѓС‡РµРЅРёРµ СЃРїРёСЃРєР° С„РёР»РёР°Р»РѕРІ РґР»СЏ РїСѓР±Р»РёС‡РЅРѕР№ СЃС‚СЂР°РЅРёС†С‹ (Р±РµР· Р°РІС‚РѕСЂРёР·Р°С†РёРё)"""
    try:
        branches = Branch.query.filter_by(is_active=True).order_by(Branch.name).all()

        return jsonify({
            'success': True,
            'branches': [serialize_branch(branch) for branch in branches]
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РїСѓР±Р»РёС‡РЅС‹С… С„РёР»РёР°Р»РѕРІ: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ С„РёР»РёР°Р»РѕРІ'}), 500

# ========== РљРђР›Р•РќР”РђР Р¬ РџРћРЎР•Р©Р•РќРР™ ==========

@bp.route('/attendance/calendar/month', methods=['GET'])
@admin_required
def get_calendar_month():
    """РџРѕР»СѓС‡РµРЅРёРµ РєР°Р»РµРЅРґР°СЂСЏ РЅР° РјРµСЃСЏС†"""
    try:
        year = request.args.get('year', type=int, default=datetime.now().year)
        month = request.args.get('month', type=int, default=datetime.now().month)
        age_group = request.args.get('age_group')
        branch_id = request.args.get('branch_id')
        
        _, last_day = calendar.monthrange(year, month)
        start_date = datetime(year, month, 1)
        end_date = datetime(year, month, last_day, 23, 59, 59)
        
        query = Attendance.query.filter(
            Attendance.scheduled_date.between(start_date, end_date)
        ).order_by(Attendance.scheduled_date)
        
        if age_group and age_group != 'all':
            query = query.filter(Attendance.age_group == age_group)
        
        if branch_id and branch_id != 'all':
            query = query.filter(Attendance.branch_id == int(branch_id))
        
        attendance_list = query.all()
        
        calendar_data = {}
        for attendance in attendance_list:
            day = attendance.scheduled_date.day
            if day not in calendar_data:
                calendar_data[day] = {
                    'date': attendance.scheduled_date.strftime('%Y-%m-%d'),
                    'day': day,
                    'weekday': attendance.scheduled_date.strftime('%A'),
                    'attendance': []
                }
            
            user = User.query.get(attendance.user_id)
            child_name = "РќРµРёР·РІРµСЃС‚РЅРѕ"
            birth_year = ""
            if user and user.children:
                for child in user.children:
                    if child.get('id') == attendance.child_id:
                        child_name = child.get('name', 'РќРµРёР·РІРµСЃС‚РЅРѕ')
                        birth_year = child.get('birth_year', '')
                        break
            
            branch = Branch.query.get(attendance.branch_id) if attendance.branch_id else None
            
            calendar_data[day]['attendance'].append({
                'id': attendance.id,
                'schedule_id': attendance.schedule_id,
                'time': attendance.scheduled_date.strftime('%H:%M'),
                'user_name': user.name if user else 'РќРµРёР·РІРµСЃС‚РЅРѕ',
                'child_name': child_name,
                'child_id': attendance.child_id,
                'birth_year': birth_year,
                'age_group': attendance.age_group,
                'branch_id': attendance.branch_id,
                'branch_name': branch.name if branch else 'РќРµ СѓРєР°Р·Р°РЅ',
                'status': attendance.status,
                'is_makeup': attendance.is_makeup,
                'notes': attendance.notes
            })
        
        month_calendar = []
        for day in range(1, last_day + 1):
            current_date = datetime(year, month, day)
            month_calendar.append({
                'date': current_date.strftime('%Y-%m-%d'),
                'day': day,
                'weekday': current_date.strftime('%A'),
                'weekday_short': current_date.strftime('%a'),
                'is_weekend': current_date.weekday() >= 5,
                'attendance': calendar_data.get(day, {'attendance': []})['attendance']
            })
        
        return jsonify({
            'success': True,
            'year': year,
            'month': month,
            'month_name': calendar.month_name[month],
            'calendar': month_calendar
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РєР°Р»РµРЅРґР°СЂСЏ: {str(e)}")
        return jsonify({'error': f'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РєР°Р»РµРЅРґР°СЂСЏ: {str(e)}'}), 500

@bp.route('/attendance/calendar/day', methods=['GET'])
@admin_required
def get_calendar_day():
    """РџРѕР»СѓС‡РµРЅРёРµ РїРѕСЃРµС‰РµРЅРёР№ РЅР° РєРѕРЅРєСЂРµС‚РЅС‹Р№ РґРµРЅСЊ"""
    try:
        date_str = request.args.get('date')
        age_group = request.args.get('age_group')
        branch_id = request.args.get('branch_id')
        
        if not date_str:
            return jsonify({'error': 'РќРµ СѓРєР°Р·Р°РЅР° РґР°С‚Р°'}), 400
        
        target_date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        start_of_day = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = target_date.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        query = Attendance.query.filter(
            Attendance.scheduled_date.between(start_of_day, end_of_day)
        )
        
        if age_group and age_group != 'all':
            query = query.filter(Attendance.age_group == age_group)
        
        if branch_id and branch_id != 'all':
            query = query.filter(Attendance.branch_id == int(branch_id))
        
        attendance_list = query.order_by(Attendance.scheduled_date).all()
        
        schedule_by_time = {}
        for attendance in attendance_list:
            time_key = attendance.scheduled_date.strftime('%H:%M')
            if time_key not in schedule_by_time:
                schedule_by_time[time_key] = []
            
            user = User.query.get(attendance.user_id)
            child_name = "РќРµРёР·РІРµСЃС‚РЅРѕ"
            birth_year = ""
            if user and user.children:
                for child in user.children:
                    if child.get('id') == attendance.child_id:
                        child_name = child.get('name', 'РќРµРёР·РІРµСЃС‚РЅРѕ')
                        birth_year = child.get('birth_year', '')
                        break
            
            payment = Payment.query.get(attendance.payment_id) if attendance.payment_id else None
            branch = Branch.query.get(attendance.branch_id) if attendance.branch_id else None
            
            schedule_by_time[time_key].append({
                'id': attendance.id,
                'attendance_id': attendance.id,
                'user_id': attendance.user_id,
                'user_name': user.name if user else 'РќРµРёР·РІРµСЃС‚РЅРѕ',
                'user_email': user.email if user else '',
                'user_phone': user.phone if user else '',
                'child_id': attendance.child_id,
                'child_name': child_name,
                'birth_year': birth_year,
                'age_group': attendance.age_group,
                'branch_id': attendance.branch_id,
                'branch_name': branch.name if branch else 'РќРµ СѓРєР°Р·Р°РЅ',
                'payment_id': attendance.payment_id,
                'payment_info': {
                    'id': payment.id if payment else None,
                    'training_count': payment.training_count if payment else None,
                    'used_trainings': payment.used_trainings if payment else None,
                    'remaining_trainings': payment.remaining_trainings if payment else None
                } if payment else None,
                'status': attendance.status,
                'is_makeup': attendance.is_makeup,
                'notes': attendance.notes,
                'actual_date': attendance.actual_date.isoformat() if attendance.actual_date else None,
                'created_at': attendance.created_at.isoformat() if attendance.created_at else None
            })
        
        schedule_list = []
        for time, records in schedule_by_time.items():
            schedule_list.append({
                'time': time,
                'records': records,
                'count': len(records)
            })
        
        return jsonify({
            'success': True,
            'date': date_str,
            'date_display': target_date.strftime('%d.%m.%Y'),
            'day_name': target_date.strftime('%A'),
            'schedule': schedule_list,
            'total_records': len(attendance_list)
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ СЂР°СЃРїРёСЃР°РЅРёСЏ РЅР° РґРµРЅСЊ: {str(e)}")
        return jsonify({'error': f'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ СЂР°СЃРїРёСЃР°РЅРёСЏ: {str(e)}'}), 500

@bp.route('/attendance/calendar/filtered', methods=['GET'])
@admin_required
def get_filtered_calendar():
    """РџРѕР»СѓС‡РµРЅРёРµ РєР°Р»РµРЅРґР°СЂСЏ СЃ С„РёР»СЊС‚СЂР°РјРё РїРѕ С„РёР»РёР°Р»Сѓ Рё РіСЂСѓРїРїРµ"""
    try:
        year = request.args.get('year', type=int, default=datetime.now().year)
        month = request.args.get('month', type=int, default=datetime.now().month)
        branch_id = request.args.get('branch_id', type=int)
        age_group = request.args.get('age_group')
        
        _, last_day = calendar.monthrange(year, month)
        start_date = datetime(year, month, 1)
        end_date = datetime(year, month, last_day, 23, 59, 59)
        
        # РџРѕР»СѓС‡Р°РµРј СЂР°СЃРїРёСЃР°РЅРёРµ РґР»СЏ РІС‹Р±СЂР°РЅРЅС‹С… С„РёР»СЊС‚СЂРѕРІ
        schedule_query = AgeSchedule.query
        
        if branch_id:
            schedule_query = schedule_query.filter_by(branch_id=branch_id)
        
        if age_group and age_group != 'all':
            schedule_query = schedule_query.filter_by(age_group=age_group)
        
        schedules = schedule_query.all()
        schedule_ids = [s.id for s in schedules]
        
        # РџРѕР»СѓС‡Р°РµРј РїРѕСЃРµС‰РµРЅРёСЏ РґР»СЏ СЌС‚РёС… СЂР°СЃРїРёСЃР°РЅРёР№
        query = Attendance.query
        
        if schedule_ids:
            query = query.filter(
                Attendance.scheduled_date.between(start_date, end_date),
                Attendance.schedule_id.in_(schedule_ids)
            )
        else:
            query = query.filter(
                Attendance.scheduled_date.between(start_date, end_date)
            )
        
        attendance_list = query.order_by(Attendance.scheduled_date).all()
        
        # Р¤РѕСЂРјРёСЂСѓРµРј РєР°Р»РµРЅРґР°СЂСЊ
        calendar_data = {}
        for attendance in attendance_list:
            day = attendance.scheduled_date.day
            if day not in calendar_data:
                calendar_data[day] = {
                    'date': attendance.scheduled_date.strftime('%Y-%m-%d'),
                    'day': day,
                    'weekday': attendance.scheduled_date.strftime('%A'),
                    'attendance': []
                }
            
            user = User.query.get(attendance.user_id)
            child_name = "РќРµРёР·РІРµСЃС‚РЅРѕ"
            child_birth_year = ""
            if user and user.children:
                for child in user.children:
                    if child.get('id') == attendance.child_id:
                        child_name = child.get('name', 'РќРµРёР·РІРµСЃС‚РЅРѕ')
                        child_birth_year = child.get('birth_year', '')
                        break
            
            # РџРѕР»СѓС‡Р°РµРј РёРЅС„РѕСЂРјР°С†РёСЋ Рѕ С„РёР»РёР°Р»Рµ
            branch_name = "РќРµРёР·РІРµСЃС‚РЅРѕ"
            if attendance.branch_id:
                branch = Branch.query.get(attendance.branch_id)
                if branch:
                    branch_name = branch.name
            
            calendar_data[day]['attendance'].append({
                'id': attendance.id,
                'time': attendance.scheduled_date.strftime('%H:%M'),
                'user_name': user.name if user else 'РќРµРёР·РІРµСЃС‚РЅРѕ',
                'child_name': child_name,
                'child_birth_year': child_birth_year,
                'age_group': attendance.age_group,
                'branch_name': branch_name,
                'status': attendance.status,
                'is_makeup': attendance.is_makeup,
                'notes': attendance.notes
            })
        
        month_calendar = []
        for day in range(1, last_day + 1):
            current_date = datetime(year, month, day)
            month_calendar.append({
                'date': current_date.strftime('%Y-%m-%d'),
                'day': day,
                'weekday': current_date.strftime('%A'),
                'weekday_short': current_date.strftime('%a'),
                'is_weekend': current_date.weekday() >= 5,
                'attendance': calendar_data.get(day, {'attendance': []})['attendance']
            })
        
        return jsonify({
            'success': True,
            'year': year,
            'month': month,
            'month_name': calendar.month_name[month],
            'calendar': month_calendar
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ С„РёР»СЊС‚СЂРѕРІР°РЅРЅРѕРіРѕ РєР°Р»РµРЅРґР°СЂСЏ: {str(e)}")
        return jsonify({'error': f'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РєР°Р»РµРЅРґР°СЂСЏ: {str(e)}'}), 500

@bp.route('/attendance/calendar/bulk-update', methods=['POST'])
@admin_required
def bulk_update_attendance():
    """РњР°СЃСЃРѕРІРѕРµ РѕР±РЅРѕРІР»РµРЅРёРµ СЃС‚Р°С‚СѓСЃРѕРІ РїРѕСЃРµС‰РµРЅРёР№"""
    try:
        data = request.get_json()
        if not data.get('attendance_ids') or not data.get('status'):
            return jsonify({'error': 'РќРµ СѓРєР°Р·Р°РЅС‹ ID Р·Р°РїРёСЃРµР№ РёР»Рё СЃС‚Р°С‚СѓСЃ'}), 400
        
        attendance_ids = data['attendance_ids']
        new_status = data['status']
        notes = data.get('notes', '')
        allowed_statuses = {'scheduled', 'attended', 'missed', 'cancelled', 'rescheduled'}

        if new_status not in allowed_statuses:
            return jsonify({'error': 'РќРµРґРѕРїСѓСЃС‚РёРјС‹Р№ СЃС‚Р°С‚СѓСЃ РїРѕСЃРµС‰РµРЅРёСЏ'}), 400
        
        updated_count = 0
        touched_payment_ids = set()
        for attendance_id in attendance_ids:
            attendance = Attendance.query.get(attendance_id)
            if attendance:
                attendance.status = new_status
                attendance.notes = notes if notes else attendance.notes
                attendance.actual_date = datetime.utcnow() if new_status == 'attended' else None
                if attendance.payment_id:
                    touched_payment_ids.add(attendance.payment_id)
                
                updated_count += 1

        for payment_id in touched_payment_ids:
            payment = Payment.query.get(payment_id)
            if payment:
                sync_payment_counters(payment)
        db.session.commit()
        
        logger.info(f"вњ… РћР±РЅРѕРІР»РµРЅРѕ {updated_count} Р·Р°РїРёСЃРµР№ РїРѕСЃРµС‰РµРЅРёР№")
        
        return jsonify({
            'success': True,
            'message': f'РћР±РЅРѕРІР»РµРЅРѕ {updated_count} Р·Р°РїРёСЃРµР№',
            'updated_count': updated_count
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"вќЊ РћС€РёР±РєР° РјР°СЃСЃРѕРІРѕРіРѕ РѕР±РЅРѕРІР»РµРЅРёСЏ: {str(e)}")
        return jsonify({'error': f'РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ: {str(e)}'}), 500

@bp.route('/attendance/day-details', methods=['GET'])
@admin_required
def get_day_details():
    """РџРѕР»СѓС‡РµРЅРёРµ РґРµС‚Р°Р»СЊРЅРѕР№ РёРЅС„РѕСЂРјР°С†РёРё Рѕ РїРѕСЃРµС‰РµРЅРёСЏС… РЅР° РґРµРЅСЊ"""
    try:
        date_str = request.args.get('date')
        branch_id = request.args.get('branch_id')
        age_group = request.args.get('age_group')
        
        if not date_str:
            return jsonify({'error': 'РќРµ СѓРєР°Р·Р°РЅР° РґР°С‚Р°'}), 400
        
        target_date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        start_of_day = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = target_date.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        query = Attendance.query.filter(
            Attendance.scheduled_date.between(start_of_day, end_of_day)
        )
        
        if branch_id and branch_id != 'all':
            query = query.filter_by(branch_id=int(branch_id))
        
        if age_group and age_group != 'all':
            query = query.filter_by(age_group=age_group)
        
        attendance_list = query.order_by(Attendance.scheduled_date).all()
        
        attendance_data = []
        for attendance in attendance_list:
            user = User.query.get(attendance.user_id)
            child_name = "РќРµРёР·РІРµСЃС‚РЅРѕ"
            birth_year = ""
            if user and user.children:
                for child in user.children:
                    if child.get('id') == attendance.child_id:
                        child_name = child.get('name', 'РќРµРёР·РІРµСЃС‚РЅРѕ')
                        birth_year = child.get('birth_year', '')
                        break
            
            payment = Payment.query.get(attendance.payment_id) if attendance.payment_id else None
            branch = Branch.query.get(attendance.branch_id) if attendance.branch_id else None
            
            attendance_data.append({
                'id': attendance.id,
                'user_id': attendance.user_id,
                'user_name': user.name if user else 'РќРµРёР·РІРµСЃС‚РЅРѕ',
                'user_email': user.email if user else '',
                'user_phone': user.phone if user else '',
                'child_id': attendance.child_id,
                'child_name': child_name,
                'birth_year': birth_year,
                'age_group': attendance.age_group,
                'branch_name': branch.name if branch else 'РќРµ СѓРєР°Р·Р°РЅ',
                'scheduled_time': attendance.scheduled_date.strftime('%H:%M'),
                'status': attendance.status,
                'is_makeup': attendance.is_makeup,
                'notes': attendance.notes,
                'payment_info': {
                    'id': payment.id if payment else None,
                    'training_count': payment.training_count if payment else None,
                    'used_trainings': payment.used_trainings if payment else None,
                    'remaining_trainings': payment.remaining_trainings if payment else None
                } if payment else None
            })
        
        # Р“СЂСѓРїРїРёСЂСѓРµРј РїРѕ РІСЂРµРјРµРЅРё
        grouped_by_time = {}
        for record in attendance_data:
            time_key = record['scheduled_time']
            if time_key not in grouped_by_time:
                grouped_by_time[time_key] = []
            grouped_by_time[time_key].append(record)
        
        return jsonify({
            'success': True,
            'date': target_date.isoformat(),
            'date_display': target_date.strftime('%d.%m.%Y'),
            'day_name': target_date.strftime('%A'),
            'total_children': len(attendance_data),
            'grouped_attendance': grouped_by_time
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РґРµС‚Р°Р»РµР№ РґРЅСЏ: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РёРЅС„РѕСЂРјР°С†РёРё'}), 500

# ========== РќРђРЎРўР РћР™РљР ==========

@bp.route('/site-content', methods=['GET'])
@admin_required
def get_site_content():
    try:
        return jsonify({
            'success': True,
            'contact_info': get_site_setting_payload('contact_info', DEFAULT_CONTACT_INFO),
            'trainers': get_site_setting_payload('trainers', DEFAULT_TRAINERS),
            'achievements': get_site_setting_payload('achievements', DEFAULT_ACHIEVEMENTS),
            'payment_plans': get_site_setting_payload('payment_plans', DEFAULT_PAYMENT_PLANS),
        })
    except Exception as e:
        logger.error(f"РІСњРЉ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РєРѕРЅС‚РµРЅС‚Р° СЃР°Р№С‚Р°: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РєРѕРЅС‚РµРЅС‚Р° СЃР°Р№С‚Р°'}), 500


@bp.route('/site-content', methods=['PUT'])
@admin_required
def update_site_content():
    try:
        data = request.get_json() or {}

        contact_info = normalize_contact_info_payload(
            data.get('contact_info', get_site_setting_payload('contact_info', DEFAULT_CONTACT_INFO))
        )
        trainers = normalize_trainers_payload(
            data.get('trainers', get_site_setting_payload('trainers', DEFAULT_TRAINERS))
        )
        achievements = normalize_achievements_payload(
            data.get('achievements', get_site_setting_payload('achievements', DEFAULT_ACHIEVEMENTS))
        )
        payment_plans = normalize_payment_plans_payload(
            data.get('payment_plans', get_site_setting_payload('payment_plans', DEFAULT_PAYMENT_PLANS))
        )

        save_site_setting_payload('contact_info', contact_info)
        save_site_setting_payload('trainers', trainers)
        save_site_setting_payload('achievements', achievements)
        save_site_setting_payload('payment_plans', payment_plans)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'РљРѕРЅС‚РµРЅС‚ СЃР°Р№С‚Р° РѕР±РЅРѕРІР»РµРЅ',
            'contact_info': contact_info,
            'trainers': trainers,
            'achievements': achievements,
            'payment_plans': payment_plans,
        })
    except ValueError as exc:
        db.session.rollback()
        return jsonify({'error': str(exc)}), 400
    except Exception as e:
        db.session.rollback()
        logger.error(f"РІСњРЉ РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ РєРѕРЅС‚РµРЅС‚Р° СЃР°Р№С‚Р°: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ РєРѕРЅС‚РµРЅС‚Р° СЃР°Р№С‚Р°'}), 500


@bp.route('/reports/summary.xlsx', methods=['GET'])
@admin_required
def download_summary_report():
    try:
        users = User.query.filter(User.id != 0).order_by(User.registered_at.desc()).all()
        payments = Payment.query.order_by(Payment.created_at.desc()).all()
        attendances = Attendance.query.order_by(Attendance.scheduled_date.desc()).all()
        branches = Branch.query.order_by(Branch.name.asc()).all()
        schedules = AgeSchedule.query.order_by(AgeSchedule.branch_id.asc(), AgeSchedule.time.asc()).all()
        applications = Application.query.order_by(Application.created_at.desc()).all()

        branch_lookup = {branch.id: branch for branch in branches}
        users_lookup = {user.id: user for user in users}
        children_lookup = {user.id: get_user_children_payload(user) for user in users}

        payment_count_by_user = {}
        attendance_count_by_user = {}
        application_count_by_user = {}

        for payment in payments:
            payment_count_by_user[payment.user_id] = payment_count_by_user.get(payment.user_id, 0) + 1

        for attendance in attendances:
            attendance_count_by_user[attendance.user_id] = attendance_count_by_user.get(attendance.user_id, 0) + 1

        for application in applications:
            if application.user_id:
                application_count_by_user[application.user_id] = application_count_by_user.get(application.user_id, 0) + 1

        children_rows = []
        for user in users:
            for child in children_lookup.get(user.id, []):
                child_branch_id = child.get('branch_id')
                child_branch = branch_lookup.get(child_branch_id)
                children_rows.append([
                    user.id,
                    user.name or '',
                    user.email or '',
                    user.phone or '',
                    child.get('id'),
                    child.get('name', ''),
                    child.get('birth_year', ''),
                    child_branch.name if child_branch else (child.get('branch_name') or 'Не указан'),
                ])

        payment_status_counts = {}
        payments_rows = []
        for payment in payments:
            user = users_lookup.get(payment.user_id)
            child = get_child_for_report(children_lookup, payment.user_id, payment.child_id)
            branch = branch_lookup.get(payment.branch_id)
            payment_status_counts[payment.status] = payment_status_counts.get(payment.status, 0) + 1

            payments_rows.append([
                payment.id,
                payment.user_id,
                user.name if user else '',
                child.get('name', ''),
                child.get('birth_year', ''),
                branch.name if branch else 'Не указан',
                payment.amount or 0,
                payment.training_count or 0,
                payment.used_trainings or 0,
                payment.remaining_trainings or 0,
                REPORT_PAYMENT_STATUS_LABELS.get(payment.status, payment.status or ''),
                payment.payment_method or '',
                payment.transaction_id or '',
                format_report_date(payment.start_date),
                format_report_date(payment.end_date),
                format_report_date(payment.created_at, include_time=True),
            ])

        attendance_status_counts = {}
        attendance_rows = []
        for attendance in attendances:
            user = users_lookup.get(attendance.user_id)
            child = get_child_for_report(children_lookup, attendance.user_id, attendance.child_id)
            branch = branch_lookup.get(attendance.branch_id)
            attendance_status_counts[attendance.status] = attendance_status_counts.get(attendance.status, 0) + 1

            attendance_rows.append([
                attendance.id,
                attendance.user_id,
                user.name if user else '',
                child.get('name', ''),
                child.get('birth_year', ''),
                branch.name if branch else 'Не указан',
                attendance.payment_id or '',
                format_report_date(attendance.scheduled_date, include_time=True),
                format_report_date(attendance.actual_date, include_time=True),
                REPORT_ATTENDANCE_STATUS_LABELS.get(attendance.status, attendance.status or ''),
                attendance.age_group or '',
                format_report_bool(attendance.is_makeup),
                format_report_bool(attendance.is_free),
                attendance.notes or '',
            ])

        schedule_count_by_branch = {}
        schedules_rows = []
        for schedule in schedules:
            branch = branch_lookup.get(schedule.branch_id)
            schedule_count_by_branch[schedule.branch_id] = schedule_count_by_branch.get(schedule.branch_id, 0) + 1
            serialized_schedule = serialize_schedule(schedule, branch=branch)
            schedules_rows.append([
                schedule.id,
                serialized_schedule['age_group'],
                serialized_schedule['birth_year_from'] or '',
                serialized_schedule['birth_year_to'] or '',
                serialized_schedule['days_string'],
                serialized_schedule['time'],
                serialized_schedule['end_time'],
                serialized_schedule['branch_name'],
                serialized_schedule['capacity'],
                serialized_schedule['instructor'],
                format_report_bool(serialized_schedule['is_active']),
                format_report_date(schedule.created_at, include_time=True),
            ])

        branches_rows = []
        for branch in branches:
            branches_rows.append([
                branch.id,
                branch.name or '',
                branch.address or '',
                branch.phone or '',
                branch.email or '',
                format_report_bool(branch.is_active),
                schedule_count_by_branch.get(branch.id, 0),
                format_report_date(branch.created_at, include_time=True),
            ])

        applications_rows = []
        for application in applications:
            user = users_lookup.get(application.user_id) if application.user_id else None
            branch = branch_lookup.get(application.branch_id)
            applications_rows.append([
                application.id,
                application.user_id or '',
                user.name if user else '',
                application.child_name or '',
                application.birth_year or '',
                branch.name if branch else 'Не указан',
                application.phone or '',
                application.email or '',
                application.status or '',
                application.trainer or '',
                application.training_time or '',
                application.message or '',
                format_report_date(application.created_at, include_time=True),
            ])

        users_rows = []
        for user in users:
            user_children = children_lookup.get(user.id, [])
            users_rows.append([
                user.id,
                user.name or '',
                user.email or '',
                user.phone or '',
                len(user_children),
                payment_count_by_user.get(user.id, 0),
                attendance_count_by_user.get(user.id, 0),
                application_count_by_user.get(user.id, 0),
                format_report_date(user.registered_at, include_time=True),
            ])

        confirmed_total_amount = sum(
            int(payment.amount or 0) for payment in payments if payment.status == 'confirmed'
        )
        overview_rows = [
            ['Дата выгрузки', format_report_date(datetime.now(), include_time=True)],
            ['Всего пользователей', len(users)],
            ['Всего детей', len(children_rows)],
            ['Всего оплат', len(payments)],
            ['Подтвержденные оплаты', payment_status_counts.get('confirmed', 0)],
            ['Ожидающие оплаты', payment_status_counts.get('pending', 0)],
            ['Неуспешные оплаты', payment_status_counts.get('failed', 0)],
            ['Сумма подтвержденных оплат, руб.', confirmed_total_amount],
            ['Всего посещений', len(attendances)],
            ['Посетил', attendance_status_counts.get('attended', 0)],
            ['Пропуск', attendance_status_counts.get('missed', 0)],
            ['Запланировано', attendance_status_counts.get('scheduled', 0)],
            ['Перенесено', attendance_status_counts.get('rescheduled', 0)],
            ['Всего филиалов', len(branches)],
            ['Активные филиалы', sum(1 for branch in branches if branch.is_active)],
            ['Всего расписаний', len(schedules)],
            ['Активные расписания', sum(1 for schedule in schedules if schedule.is_active)],
            ['Всего заявок', len(applications)],
        ]

        output = BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})

        write_report_sheet(workbook, 'Обзор', ['Показатель', 'Значение'], overview_rows)
        write_report_sheet(
            workbook,
            'Пользователи',
            ['ID', 'Имя', 'Email', 'Телефон', 'Детей', 'Оплат', 'Посещений', 'Заявок', 'Зарегистрирован'],
            users_rows,
        )
        write_report_sheet(
            workbook,
            'Дети',
            ['ID родителя', 'Родитель', 'Email', 'Телефон', 'ID ребенка', 'Имя ребенка', 'Год рождения', 'Филиал'],
            children_rows,
        )
        write_report_sheet(
            workbook,
            'Оплаты',
            [
                'ID', 'ID пользователя', 'Пользователь', 'Ребенок', 'Год рождения', 'Филиал',
                'Сумма', 'Тренировок', 'Использовано', 'Осталось', 'Статус', 'Способ оплаты',
                'Транзакция', 'Начало периода', 'Конец периода', 'Создано',
            ],
            payments_rows,
        )
        write_report_sheet(
            workbook,
            'Посещаемость',
            [
                'ID', 'ID пользователя', 'Пользователь', 'Ребенок', 'Год рождения', 'Филиал',
                'ID оплаты', 'Запланировано', 'Факт', 'Статус', 'Группа', 'Отработка', 'Бесплатно', 'Комментарий',
            ],
            attendance_rows,
        )
        write_report_sheet(
            workbook,
            'Филиалы',
            ['ID', 'Название', 'Адрес', 'Телефон', 'Email', 'Активен', 'Расписаний', 'Создан'],
            branches_rows,
        )
        write_report_sheet(
            workbook,
            'Расписание',
            ['ID', 'Годы рождения', 'С года', 'По год', 'Дни', 'Начало', 'Конец', 'Филиал', 'Вместимость', 'Тренер', 'Активно', 'Создано'],
            schedules_rows,
        )
        write_report_sheet(
            workbook,
            'Заявки',
            ['ID', 'ID пользователя', 'Пользователь', 'Ребенок', 'Год рождения', 'Филиал', 'Телефон', 'Email', 'Статус', 'Тренер', 'Время', 'Сообщение', 'Создано'],
            applications_rows,
        )

        workbook.close()
        output.seek(0)

        filename = f"dneprovets-admin-summary-{datetime.now().strftime('%Y-%m-%d_%H-%M')}.xlsx"
        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=filename,
        )
    except Exception as e:
        logger.error(f"Ошибка формирования сводного отчета: {str(e)}")
        return jsonify({'error': 'Не удалось сформировать сводный Excel-файл'}), 500


@bp.route('/settings', methods=['GET'])
@admin_required
def get_settings():
    """РџРѕР»СѓС‡РµРЅРёРµ РІСЃРµС… РЅР°СЃС‚СЂРѕРµРє СЃРёСЃС‚РµРјС‹"""
    try:
        # РџРѕР»СѓС‡Р°РµРј РІСЃРµ С„РёР»РёР°Р»С‹
        branches = Branch.query.all()
        branches_data = [{
            'id': b.id,
            'name': b.name,
            'address': b.address,
            'phone': b.phone,
            'email': b.email,
            'is_active': b.is_active
        } for b in branches]
        
        # РџРѕР»СѓС‡Р°РµРј РІСЃРµ РІРѕР·СЂР°СЃС‚РЅС‹Рµ РіСЂСѓРїРїС‹
        age_groups = AgeSchedule.query.with_entities(AgeSchedule.age_group).distinct().all()
        age_groups_data = [ag[0] for ag in age_groups]
        
        # РџРѕР»СѓС‡Р°РµРј СЂР°СЃРїРёСЃР°РЅРёРµ
        schedules = AgeSchedule.query.all()
        schedules_data = [{
            'id': s.id,
            'age_group': s.age_group,
            'days_of_week': s.days_of_week if isinstance(s.days_of_week, list) else json.loads(s.days_of_week) if isinstance(s.days_of_week, str) else [],
            'time': s.time,
            'branch_id': s.branch_id,
            'branch_name': Branch.query.get(s.branch_id).name if Branch.query.get(s.branch_id) else 'РќРµРёР·РІРµСЃС‚РЅРѕ',
            'capacity': s.capacity,
            'instructor': s.instructor,
            'is_active': s.is_active
        } for s in schedules]
        
        # РќР°СЃС‚СЂРѕР№РєРё РїРѕС‡С‚С‹
        from app import app
        mail_settings = {
            'mail_server': app.config['MAIL_SERVER'],
            'mail_port': app.config['MAIL_PORT'],
            'mail_username': app.config['MAIL_USERNAME'],
            'recipient_emails': ['makarkaleev@yandex.ru']
        }
        
        return jsonify({
            'success': True,
            'branches': branches_data,
            'age_groups': age_groups_data,
            'schedules': schedules_data,
            'mail_settings': mail_settings
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РЅР°СЃС‚СЂРѕРµРє: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РЅР°СЃС‚СЂРѕРµРє'}), 500

@bp.route('/create-test-users', methods=['POST'])
@cross_origin()
def create_test_users():
    """РЎРѕР·РґР°РЅРёРµ С‚РµСЃС‚РѕРІС‹С… РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№ РґР»СЏ Р°РґРјРёРЅ-РїР°РЅРµР»Рё"""
    try:
        from utils import hash_password
        
        # РЈРґР°Р»СЏРµРј СЃС‚Р°СЂС‹С… С‚РµСЃС‚РѕРІС‹С… РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№
        test_users = User.query.filter(User.email.like('test%@example.com')).all()
        for user in test_users:
            # РЈРґР°Р»СЏРµРј СЃРІСЏР·Р°РЅРЅС‹Рµ Р·Р°РїРёСЃРё
            Payment.query.filter_by(user_id=user.id).delete()
            Attendance.query.filter_by(user_id=user.id).delete()
            Token.query.filter_by(user_id=user.id).delete()
            Application.query.filter_by(user_id=user.id).delete()
            db.session.delete(user)
        
        db.session.commit()
        
        test_users_data = [
            {
                'email': 'test1@example.com',
                'name': 'РРІР°РЅ РџРµС‚СЂРѕРІ',
                'phone': '+7 (912) 345-67-89',
                'password': 'password123',
                'children': [
                    {'id': 1, 'name': 'РђР»РµРєСЃРµР№', 'birth_year': 2018},
                    {'id': 2, 'name': 'РњР°СЂРёСЏ', 'birth_year': 2020}
                ]
            },
            {
                'email': 'test2@example.com',
                'name': 'РђРЅРЅР° РЎРёРґРѕСЂРѕРІР°',
                'phone': '+7 (923) 456-78-90',
                'password': 'password123',
                'children': [
                    {'id': 3, 'name': 'Р”РјРёС‚СЂРёР№', 'birth_year': 2016}
                ]
            },
            {
                'email': 'test3@example.com',
                'name': 'РЎРµСЂРіРµР№ РљРѕР·Р»РѕРІ',
                'phone': '+7 (934) 567-89-01',
                'password': 'password123',
                'children': [
                    {'id': 4, 'name': 'Р•РєР°С‚РµСЂРёРЅР°', 'birth_year': 2017},
                    {'id': 5, 'name': 'РђСЂС‚РµРј', 'birth_year': 2019}
                ]
            }
        ]
        
        created_count = 0
        for user_data in test_users_data:
            existing_user = User.query.filter_by(email=user_data['email']).first()
            if not existing_user:
                user = User(
                    email=user_data['email'],
                    name=user_data['name'],
                    password_hash=hash_password(user_data['password']),
                    phone=user_data['phone'],
                    children=user_data['children']
                )
                db.session.add(user)
                created_count += 1
        
        db.session.commit()
        
        logger.info(f"вњ… РЎРѕР·РґР°РЅРѕ {created_count} С‚РµСЃС‚РѕРІС‹С… РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№ РґР»СЏ Р°РґРјРёРЅ-РїР°РЅРµР»Рё")
        
        return jsonify({
            'success': True,
            'message': f'РЎРѕР·РґР°РЅРѕ {created_count} С‚РµСЃС‚РѕРІС‹С… РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№',
            'count': created_count
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"вќЊ РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ С‚РµСЃС‚РѕРІС‹С… РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№: {str(e)}")
        return jsonify({'error': f'РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ С‚РµСЃС‚РѕРІС‹С… РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№: {str(e)}'}), 500
    
@bp.route('/settings/update', methods=['POST'])
@admin_required
def update_settings():
    """РћР±РЅРѕРІР»РµРЅРёРµ РЅР°СЃС‚СЂРѕРµРє СЃРёСЃС‚РµРјС‹"""
    try:
        data = request.get_json()
        
        # Р’ СЂРµР°Р»СЊРЅРѕРј РїСЂРёР»РѕР¶РµРЅРёРё СЃРѕС…СЂР°РЅСЏР»Рё Р±С‹ РІ Р‘Р” С‚Р°Р±Р»РёС†Сѓ РЅР°СЃС‚СЂРѕРµРє
        # Р—РґРµСЃСЊ РїСЂРѕСЃС‚Рѕ Р»РѕРіРёСЂСѓРµРј
        
        logger.info(f"вљ™пёЏ РћР±РЅРѕРІР»РµРЅС‹ РЅР°СЃС‚СЂРѕР№РєРё СЃРёСЃС‚РµРјС‹: {data}")
        
        return jsonify({
            'success': True,
            'message': 'РќР°СЃС‚СЂРѕР№РєРё СЃРѕС…СЂР°РЅРµРЅС‹'
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ РЅР°СЃС‚СЂРѕРµРє: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ РЅР°СЃС‚СЂРѕРµРє'}), 500
    
@bp.route('/schedules/sync', methods=['POST'])
@admin_required
def sync_schedules():
    """РЎРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ РІСЃРµС… СЂР°СЃРїРёСЃР°РЅРёР№ (РґР»СЏ РѕС‚Р»Р°РґРєРё)"""
    try:
        # РџРѕР»СѓС‡Р°РµРј РІСЃРµ СЂР°СЃРїРёСЃР°РЅРёСЏ РёР· Р‘Р”
        schedules = AgeSchedule.query.all()
        
        schedules_data = []
        for schedule in schedules:
            branch = Branch.query.get(schedule.branch_id)
            
            # РџРѕР»СѓС‡Р°РµРј РґРЅРё РЅРµРґРµР»Рё
            days_list = schedule.days_of_week
            if isinstance(days_list, str):
                try:
                    days_list = json.loads(days_list)
                except:
                    days_list = []
            elif days_list is None:
                days_list = []
            
            # РџРѕР»СѓС‡Р°РµРј РѕС‚РѕР±СЂР°Р¶Р°РµРјС‹Рµ РЅР°Р·РІР°РЅРёСЏ РґРЅРµР№
            day_names = []
            for day_num in days_list:
                if 0 <= day_num <= 6:
                    day_names.append(['РџРЅ', 'Р’С‚', 'РЎСЂ', 'Р§С‚', 'РџС‚', 'РЎР±', 'Р’СЃ'][day_num])
            
            schedules_data.append({
                'id': schedule.id,
                'age_group': schedule.age_group,
                'days_of_week': days_list,
                'days_display': day_names,
                'days_string': ', '.join(day_names),
                'time': schedule.time,
                'branch_id': schedule.branch_id,
                'branch_name': branch.name if branch else 'РќРµРёР·РІРµСЃС‚РЅРѕ',
                'capacity': schedule.capacity,
                'instructor': schedule.instructor,
                'is_active': schedule.is_active,
                'created_at': schedule.created_at.isoformat() if schedule.created_at else None
            })
        
        logger.info(f"вњ… РЎРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°РЅРѕ {len(schedules_data)} СЂР°СЃРїРёСЃР°РЅРёР№")
        
        return jsonify({
            'success': True,
            'schedules': schedules_data,
            'count': len(schedules_data)
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёРё СЂР°СЃРїРёСЃР°РЅРёР№: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёРё СЂР°СЃРїРёСЃР°РЅРёР№'}), 500

# ========== API Р”Р›РЇ Р‘Р«РЎРўР РћР“Рћ Р”РћРЎРўРЈРџРђ ==========

@bp.route('/quick-stats', methods=['GET'])
@admin_required
def get_quick_stats():
    """Р‘С‹СЃС‚СЂР°СЏ СЃС‚Р°С‚РёСЃС‚РёРєР° РґР»СЏ РґР°С€Р±РѕСЂРґР°"""
    try:
        total_users = User.query.filter(User.id != 0).count()
        total_schedules = AgeSchedule.query.filter_by(is_active=True).count()
        total_branches = Branch.query.filter_by(is_active=True).count()
        total_payments = Payment.query.filter_by(status='confirmed').count()
        
        # РџРѕСЃР»РµРґРЅРёРµ 5 РїР»Р°С‚РµР¶РµР№
        recent_payments = Payment.query.order_by(Payment.created_at.desc()).limit(5).all()
        payments_data = []
        for payment in recent_payments:
            user = User.query.get(payment.user_id)
            branch = Branch.query.get(payment.branch_id) if payment.branch_id else None
            payments_data.append({
                'id': payment.id,
                'user_name': user.name if user else 'РќРµРёР·РІРµСЃС‚РЅРѕ',
                'child_id': payment.child_id,
                'amount': payment.amount,
                'status': payment.status,
                'created_at': payment.created_at.isoformat() if payment.created_at else None,
                'branch_name': branch.name if branch else 'РќРµ СѓРєР°Р·Р°РЅ'
            })
        
        return jsonify({
            'success': True,
            'stats': {
                'users': total_users,
                'schedules': total_schedules,
                'branches': total_branches,
                'payments': total_payments
            },
            'recent_payments': payments_data
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ СЃС‚Р°С‚РёСЃС‚РёРєРё: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ СЃС‚Р°С‚РёСЃС‚РёРєРё'}), 500
    
@bp.route('/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    """РЈРґР°Р»РµРЅРёРµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ"""
    try:
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ'}), 404
        
        # РџСЂРѕРІРµСЂСЏРµРј, С‡С‚Рѕ СЌС‚Рѕ РЅРµ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ (user_id = 0)
        if user_id == 0:
            return jsonify({'error': 'РќРµР»СЊР·СЏ СѓРґР°Р»РёС‚СЊ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР°'}), 400
        
        # РџСЂРѕРІРµСЂСЏРµРј РІСЃРµ СЃРІСЏР·Р°РЅРЅС‹Рµ РґР°РЅРЅС‹Рµ
        payments_count = Payment.query.filter_by(user_id=user_id).count()
        attendance_count = Attendance.query.filter_by(user_id=user_id).count()
        applications_count = Application.query.filter_by(user_id=user_id).count()
        tokens_count = Token.query.filter_by(user_id=user_id).count()
        
        error_messages = []
        if payments_count > 0:
            error_messages.append(f'РџР»Р°С‚РµР¶Рё: {payments_count} Р·Р°РїРёСЃРµР№')
        if attendance_count > 0:
            error_messages.append(f'РџРѕСЃРµС‰РµРЅРёСЏ: {attendance_count} Р·Р°РїРёСЃРµР№')
        if applications_count > 0:
            error_messages.append(f'Р—Р°СЏРІРєРё: {applications_count} Р·Р°РїРёСЃРµР№')
        
        if error_messages:
            return jsonify({
                'error': f'РќРµР»СЊР·СЏ СѓРґР°Р»РёС‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ. Р•СЃС‚СЊ СЃРІСЏР·Р°РЅРЅС‹Рµ РґР°РЅРЅС‹Рµ:',
                'details': error_messages,
                'counts': {
                    'payments': payments_count,
                    'attendance': attendance_count,
                    'applications': applications_count,
                    'tokens': tokens_count
                }
            }), 400
        
        # РЈРґР°Р»СЏРµРј С‚РѕРєРµРЅС‹ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
        Token.query.filter_by(user_id=user_id).delete()
        
        # РЈРґР°Р»СЏРµРј РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
        db.session.delete(user)
        db.session.commit()
        
        logger.info(f"вњ… РЈРґР°Р»РµРЅ РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ: {user.name} (ID: {user_id})")
        
        return jsonify({
            'success': True,
            'message': 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СѓРґР°Р»РµРЅ',
            'deleted_user': {
                'id': user.id,
                'name': user.name,
                'email': user.email
            }
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"вќЊ РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ {user_id}: {str(e)}")
        return jsonify({'error': f'РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ: {str(e)}'}), 500

@bp.route('/users/<int:user_id>/force', methods=['DELETE'])
@admin_required
def force_delete_user(user_id):
    """РџСЂРёРЅСѓРґРёС‚РµР»СЊРЅРѕРµ СѓРґР°Р»РµРЅРёРµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ СЃРѕ РІСЃРµРјРё СЃРІСЏР·Р°РЅРЅС‹РјРё РґР°РЅРЅС‹РјРё"""
    try:
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ'}), 404
        
        if user_id == 0:
            return jsonify({'error': 'РќРµР»СЊР·СЏ СѓРґР°Р»РёС‚СЊ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР°'}), 400
        
        # РџРѕРґСЃС‡РёС‚С‹РІР°РµРј РґР°РЅРЅС‹Рµ РґР»СЏ Р»РѕРіРѕРІ
        payments_count = Payment.query.filter_by(user_id=user_id).count()
        attendance_count = Attendance.query.filter_by(user_id=user_id).count()
        applications_count = Application.query.filter_by(user_id=user_id).count()
        tokens_count = Token.query.filter_by(user_id=user_id).count()
        
        # РЈРґР°Р»СЏРµРј РІСЃРµ СЃРІСЏР·Р°РЅРЅС‹Рµ РґР°РЅРЅС‹Рµ
        Payment.query.filter_by(user_id=user_id).delete()
        Attendance.query.filter_by(user_id=user_id).delete()
        Application.query.filter_by(user_id=user_id).delete()
        Token.query.filter_by(user_id=user_id).delete()
        
        # РЈРґР°Р»СЏРµРј РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
        db.session.delete(user)
        db.session.commit()
        
        logger.info(f"рџ—‘пёЏ РџСЂРёРЅСѓРґРёС‚РµР»СЊРЅРѕ СѓРґР°Р»РµРЅ РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ: {user.name}")
        logger.info(f"рџ“Љ РЈРґР°Р»РµРЅРѕ: {payments_count} РїР»Р°С‚РµР¶РµР№, {attendance_count} РїРѕСЃРµС‰РµРЅРёР№, {applications_count} Р·Р°СЏРІРѕРє, {tokens_count} С‚РѕРєРµРЅРѕРІ")
        
        return jsonify({
            'success': True,
            'message': 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ Рё СЃРІСЏР·Р°РЅРЅС‹Рµ РґР°РЅРЅС‹Рµ СѓРґР°Р»РµРЅС‹',
            'deleted': {
                'user_id': user_id,
                'user_name': user.name,
                'payments_deleted': payments_count,
                'attendance_deleted': attendance_count,
                'applications_deleted': applications_count,
                'tokens_deleted': tokens_count
            }
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"вќЊ РћС€РёР±РєР° РїСЂРёРЅСѓРґРёС‚РµР»СЊРЅРѕРіРѕ СѓРґР°Р»РµРЅРёСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ: {str(e)}")
        return jsonify({'error': f'РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ: {str(e)}'}), 500

# ========== API Р”Р›РЇ РЈР”РђР›Р•РќРРЇ РџР›РђРўР•Р–Р•Р™ ==========

@bp.route('/payments/<int:payment_id>', methods=['DELETE'])
@admin_required
def delete_payment(payment_id):
    """РЈРґР°Р»РµРЅРёРµ РїР»Р°С‚РµР¶Р°"""
    try:
        payment = Payment.query.get(payment_id)
        
        if not payment:
            return jsonify({'error': 'РџР»Р°С‚РµР¶ РЅРµ РЅР°Р№РґРµРЅ'}), 404
        
        # РџСЂРѕРІРµСЂСЏРµРј СЃС‚Р°С‚СѓСЃ РїР»Р°С‚РµР¶Р°
        if payment.status == 'confirmed':
            return jsonify({
                'error': 'РќРµР»СЊР·СЏ СѓРґР°Р»РёС‚СЊ РїРѕРґС‚РІРµСЂР¶РґРµРЅРЅС‹Р№ РїР»Р°С‚РµР¶. РЎРЅР°С‡Р°Р»Р° РѕС‚РјРµРЅРёС‚Рµ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ.'
            }), 400
        
        # РџСЂРѕРІРµСЂСЏРµРј СЃРІСЏР·Р°РЅРЅС‹Рµ РїРѕСЃРµС‰РµРЅРёСЏ
        attendance_count = Attendance.query.filter_by(payment_id=payment_id).count()
        
        if attendance_count > 0:
            return jsonify({
                'error': f'РќРµР»СЊР·СЏ СѓРґР°Р»РёС‚СЊ РїР»Р°С‚РµР¶. Р•СЃС‚СЊ {attendance_count} СЃРІСЏР·Р°РЅРЅС‹С… Р·Р°РїРёСЃРµР№ РїРѕСЃРµС‰РµРЅРёР№'
            }), 400
        
        # РЈРґР°Р»СЏРµРј РїР»Р°С‚РµР¶
        db.session.delete(payment)
        db.session.commit()
        
        logger.info(f"вњ… РЈРґР°Р»РµРЅ РїР»Р°С‚РµР¶ ID: {payment_id}")
        
        return jsonify({
            'success': True,
            'message': 'РџР»Р°С‚РµР¶ СѓРґР°Р»РµРЅ',
            'deleted_payment': {
                'id': payment_id,
                'amount': payment.amount,
                'status': payment.status
            }
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"вќЊ РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ РїР»Р°С‚РµР¶Р° {payment_id}: {str(e)}")
        return jsonify({'error': f'РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ РїР»Р°С‚РµР¶Р°: {str(e)}'}), 500

@bp.route('/payments/<int:payment_id>/force', methods=['DELETE'])
@admin_required
def force_delete_payment(payment_id):
    """РџСЂРёРЅСѓРґРёС‚РµР»СЊРЅРѕРµ СѓРґР°Р»РµРЅРёРµ РїР»Р°С‚РµР¶Р° СЃРѕ РІСЃРµРјРё СЃРІСЏР·Р°РЅРЅС‹РјРё РґР°РЅРЅС‹РјРё"""
    try:
        payment = Payment.query.get(payment_id)
        
        if not payment:
            return jsonify({'error': 'РџР»Р°С‚РµР¶ РЅРµ РЅР°Р№РґРµРЅ'}), 404
        
        # РџРѕРґСЃС‡РёС‚С‹РІР°РµРј СЃРІСЏР·Р°РЅРЅС‹Рµ РґР°РЅРЅС‹Рµ
        attendance_count = Attendance.query.filter_by(payment_id=payment_id).count()
        
        # РЈРґР°Р»СЏРµРј СЃРІСЏР·Р°РЅРЅС‹Рµ РїРѕСЃРµС‰РµРЅРёСЏ
        Attendance.query.filter_by(payment_id=payment_id).delete()
        
        # РЈРґР°Р»СЏРµРј РїР»Р°С‚РµР¶
        db.session.delete(payment)
        db.session.commit()
        
        logger.info(f"рџ—‘пёЏ РџСЂРёРЅСѓРґРёС‚РµР»СЊРЅРѕ СѓРґР°Р»РµРЅ РїР»Р°С‚РµР¶ ID: {payment_id}")
        logger.info(f"рџ“Љ РЈРґР°Р»РµРЅРѕ {attendance_count} СЃРІСЏР·Р°РЅРЅС‹С… РїРѕСЃРµС‰РµРЅРёР№")
        
        return jsonify({
            'success': True,
            'message': 'РџР»Р°С‚РµР¶ Рё СЃРІСЏР·Р°РЅРЅС‹Рµ РїРѕСЃРµС‰РµРЅРёСЏ СѓРґР°Р»РµРЅС‹',
            'deleted': {
                'payment_id': payment_id,
                'amount': payment.amount,
                'status': payment.status,
                'attendance_deleted': attendance_count
            }
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"вќЊ РћС€РёР±РєР° РїСЂРёРЅСѓРґРёС‚РµР»СЊРЅРѕРіРѕ СѓРґР°Р»РµРЅРёСЏ РїР»Р°С‚РµР¶Р°: {str(e)}")
        return jsonify({'error': f'РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ: {str(e)}'}), 500

@bp.route('/payments/<int:payment_id>/dependencies', methods=['GET'])
@admin_required
def get_payment_dependencies(payment_id):
    """РџРѕР»СѓС‡РµРЅРёРµ РёРЅС„РѕСЂРјР°С†РёРё Рѕ СЃРІСЏР·Р°РЅРЅС‹С… РґР°РЅРЅС‹С… РїР»Р°С‚РµР¶Р°"""
    try:
        payment = Payment.query.get(payment_id)
        
        if not payment:
            return jsonify({'error': 'РџР»Р°С‚РµР¶ РЅРµ РЅР°Р№РґРµРЅ'}), 404
        
        # РџРѕР»СѓС‡Р°РµРј РІСЃРµ СЃРІСЏР·Р°РЅРЅС‹Рµ РґР°РЅРЅС‹Рµ
        attendances = Attendance.query.filter_by(payment_id=payment_id).all()
        
        # РџРѕРґРіРѕС‚РѕРІРєР° РґР°РЅРЅС‹С…
        attendances_data = [{
            'id': a.id,
            'scheduled_date': a.scheduled_date.isoformat() if a.scheduled_date else None,
            'status': a.status,
            'child_id': a.child_id,
            'age_group': a.age_group
        } for a in attendances]
        
        user = User.query.get(payment.user_id) if payment.user_id else None
        child_name = "РќРµРёР·РІРµСЃС‚РЅРѕ"
        if user and user.children:
            for child in user.children:
                if child.get('id') == payment.child_id:
                    child_name = child.get('name', 'РќРµРёР·РІРµСЃС‚РЅРѕ')
                    break
        
        return jsonify({
            'success': True,
            'payment': {
                'id': payment.id,
                'amount': payment.amount,
                'status': payment.status,
                'user_id': payment.user_id,
                'user_name': user.name if user else 'РќРµРёР·РІРµСЃС‚РЅРѕ',
                'child_name': child_name,
                'training_count': payment.training_count,
                'created_at': payment.created_at.isoformat() if payment.created_at else None
            },
            'dependencies': {
                'attendance': {
                    'count': len(attendances),
                    'items': attendances_data
                }
            },
            'summary': {
                'total_dependencies': len(attendances),
                'can_delete': len(attendances) == 0,
                'can_delete_with_warning': payment.status != 'confirmed'
            }
        })
        
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ Р·Р°РІРёСЃРёРјРѕСЃС‚РµР№ РїР»Р°С‚РµР¶Р°: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РґР°РЅРЅС‹С…'}), 500


