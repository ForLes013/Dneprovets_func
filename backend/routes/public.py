# routes/public.py
from flask import Blueprint, request, jsonify
from flask_cors import cross_origin
from flask_mail import Message
from models import db, Branch, AgeSchedule, Application, Token, User, Payment
from utils import (
    DEFAULT_ACHIEVEMENTS,
    DEFAULT_CONTACT_INFO,
    DEFAULT_PAYMENT_PLANS,
    DEFAULT_TRAINERS,
    create_email_message,
    get_site_setting_value,
    save_application_to_file,
    log_to_console,
    logger,
)
from datetime import datetime, timedelta
import os

bp = Blueprint('public', __name__)

# Получатели заявок
RECIPIENT_EMAILS = ['makarkaleev@yandex.ru']

@bp.route('/api/health', methods=['GET'])
@cross_origin()
def health_check():
    return jsonify({
        "status": "healthy", 
        "message": "Сервер работает! База данных и почта настроены.",
        "database": "SQLite",
        "mail_server": 'smtp.yandex.ru',
        "timestamp": datetime.now().isoformat()
    })


@bp.route('/api/test-email', methods=['GET'])
@cross_origin()
def test_email():
    """Тестовый endpoint для проверки почты"""
    try:
        from app import mail
        msg = Message(
            subject="✅ Тест почты от Футбольной школы",
            body="Это тестовое сообщение. Если вы его получили, значит почта настроена правильно!",
            recipients=RECIPIENT_EMAILS
        )
        
        mail.send(msg)
        logger.info("✅ Тестовое письмо отправлено успешно!")
        
        return jsonify({
            "success": True,
            "message": "Тестовое письмо отправлено! Проверьте почту."
        })
        
    except Exception as e:
        logger.error(f"❌ Ошибка отправки тестового письма: {str(e)}")
        return jsonify({
            "success": False,
            "message": f"Ошибка отправки: {str(e)}"
        }), 500

@bp.route('/api/branches', methods=['GET'])
@cross_origin()
def get_all_branches():
    """Получение списка всех филиалов (публичный)"""
    try:
        branches = Branch.query.filter_by(is_active=True).order_by(Branch.name).all()
        
        branches_data = []
        for branch in branches:
            branches_data.append({
                'id': branch.id,
                'name': branch.name,
                'address': branch.address,
                'phone': branch.phone,
                'email': branch.email
            })
        
        return jsonify({
            'success': True,
            'branches': branches_data
        })
        
    except Exception as e:
        logger.error(f"❌ Ошибка получения филиалов: {str(e)}")
        return jsonify({'error': 'Ошибка получения филиалов'}), 500

@bp.route('/api/site-content', methods=['GET'])
@cross_origin()
def get_site_content():
    try:
        return jsonify({
            'success': True,
            'contact_info': get_site_setting_value('contact_info', DEFAULT_CONTACT_INFO),
            'trainers': get_site_setting_value('trainers', DEFAULT_TRAINERS),
            'achievements': get_site_setting_value('achievements', DEFAULT_ACHIEVEMENTS),
            'payment_plans': get_site_setting_value('payment_plans', DEFAULT_PAYMENT_PLANS),
        })
    except Exception as e:
        logger.error(f"вќЊ РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РєРѕРЅС‚РµРЅС‚Р° СЃР°Р№С‚Р°: {str(e)}")
        return jsonify({'error': 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РєРѕРЅС‚РµРЅС‚Р° СЃР°Р№С‚Р°'}), 500


@bp.route('/api/send-application', methods=['POST'])
@cross_origin()
def send_application():
    """Отправка заявки на тренировку"""
    try:
        logger.info("📨 Получена новая заявка")
        
        data = request.get_json()
        
        if not data:
            return jsonify({
                "success": False,
                "message": "Неверный формат данных"
            }), 400
        
        required_fields = ['name', 'phone', 'childName', 'birthYear', 'branch_id']
        missing_fields = []
        
        for field in required_fields:
            if not data.get(field):
                missing_fields.append(field)
        
        if missing_fields:
            return jsonify({
                "success": False,
                "message": f"Заполните обязательные поля: {', '.join(missing_fields)}"
            }), 400
        
        user_id = None
        token_str = request.headers.get('Authorization')
        if token_str:
            try:
                token_str = token_str.replace('Bearer ', '')
                token = Token.query.filter_by(token=token_str).first()
                if token and token.expires_at > datetime.now():
                    user_id = token.user_id
            except:
                pass
        
        branch = Branch.query.get(data['branch_id'])
        
        application = Application(
            user_id=user_id,
            child_name=data.get('childName'),
            birth_year=int(data.get('birthYear')),
            branch_id=data.get('branch_id'),
            phone=data.get('phone'),
            email=data.get('email'),
            message=data.get('message'),
            status='pending'
        )
        
        db.session.add(application)
        db.session.commit()
        
        # Подготовка данных для email
        email_data = data.copy()
        email_data['branch_name'] = branch.name if branch else 'Не указан'
        
        subject, body = create_email_message(email_data)
        
        try:
            from app import mail
            msg = Message(
                subject=subject,
                body=body,
                recipients=RECIPIENT_EMAILS
            )
            
            mail.send(msg)
            logger.info("✅ Email отправлен успешно!")
        except Exception as e:
            logger.error(f"❌ Ошибка отправки email: {str(e)}")
        
        save_application_to_file(email_data)
        log_to_console(email_data)
        
        return jsonify({
            "success": True,
            "message": "✅ Заявка успешно отправлена! Мы свяжемся с вами в течение 30 минут.",
            "application_id": application.id
        })
            
    except Exception as e:
        db.session.rollback()
        logger.error(f"❌ Ошибка при отправке заявки: {str(e)}")
        
        try:
            if data:
                save_application_to_file(data)
                log_to_console(data)
                logger.info("✅ Заявка сохранена в файл (почта не сработала)")
        except:
            pass
            
        return jsonify({
            "success": False,
            "message": "⚠️ Произошла ошибка при отправке. Мы сохранили вашу заявку и свяжемся с вами."
        }), 500

@bp.route('/api/debug/create-test-data', methods=['POST'])
@cross_origin()
def create_test_data():
    """Создание тестовых данных для отладки"""
    try:
        data = request.get_json()
        token_str = data.get('token') if data else None
        
        if not token_str:
            return jsonify({'error': 'Требуется токен'}), 401
        
        token = Token.query.filter_by(token=token_str).first()
        if not token:
            return jsonify({'error': 'Недействительный токен'}), 401
        
        user = db.session.get(User, token.user_id)
        
        if not user.children:
            return jsonify({'error': 'Сначала добавьте ребенка'}), 400
        
        child = user.children[0]
        birth_year = child.get('birth_year', 2018)
        
        # Находим филиал
        branch = Branch.query.filter_by(is_active=True).first()
        if not branch:
            return jsonify({'error': 'Нет активных филиалов'}), 400
        
        payment = Payment(
            user_id=user.id,
            child_id=child['id'],
            branch_id=branch.id,
            amount=4000,
            training_count=8,
            used_trainings=0,
            remaining_trainings=8,
            start_date=datetime.now(),
            end_date=datetime.now() + timedelta(days=30),
            status='confirmed',
            payment_method='card'
        )
        db.session.add(payment)
        db.session.commit()
        
        from utils import create_attendance_records
        create_attendance_records(
            user.id, 
            child['id'], 
            payment.id, 
            datetime.now(), 
            datetime.now() + timedelta(days=30), 
            8,
            birth_year,
            branch.id
        )
        
        logger.info(f"✅ Созданы тестовые данные для пользователя {user.email}")
        
        return jsonify({
            'success': True,
            'message': 'Тестовые данные созданы',
            'payment_id': payment.id
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"❌ Ошибка создания тестовых данных: {str(e)}")
        return jsonify({'error': f'Ошибка создания тестовых данных: {str(e)}'}), 500
