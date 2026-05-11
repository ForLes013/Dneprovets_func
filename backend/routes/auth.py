from hmac import compare_digest
from datetime import datetime, timedelta

from flask import Blueprint, current_app, jsonify, request
from flask_cors import cross_origin

from models import Token, User, db
from utils import (
    generate_token,
    hash_password,
    logger,
    normalize_children_payload,
    password_needs_upgrade,
    verify_password,
)

bp = Blueprint('auth', __name__)


@bp.route('/api/register', methods=['POST'])
@cross_origin()
def register():
    """User registration."""
    try:
        data = request.get_json()
        logger.info(f"Registration attempt: {data.get('email')}")

        if not data.get('email') or not data.get('name') or not data.get('password'):
            return jsonify({'error': 'Email, имя и пароль обязательны'}), 400

        if len(data.get('password', '')) < 6:
            return jsonify({'error': 'Пароль должен быть не менее 6 символов'}), 400

        existing_user = User.query.filter_by(email=data['email']).first()
        if existing_user:
            logger.warning(f"User already exists: {data['email']}")
            return jsonify({'error': 'Пользователь с таким email уже существует'}), 400

        user = User(
            email=data['email'],
            name=data.get('name'),
            password_hash=hash_password(data['password']),
            phone=data.get('phone'),
            children=[],
        )

        db.session.add(user)
        db.session.commit()

        user.children = normalize_children_payload(data.get('children', []), user.id)
        db.session.commit()

        token = Token(
            token=generate_token(),
            user_id=user.id,
            expires_at=datetime.now() + timedelta(days=30),
        )

        db.session.add(token)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Регистрация успешна',
            'token': token.token,
            'user': {
                'id': user.id,
                'name': user.name,
                'email': user.email,
                'phone': user.phone,
                'children': user.children,
                'registered_at': user.registered_at.isoformat(),
            },
        })

    except Exception as exc:
        db.session.rollback()
        logger.error(f"Registration failed: {exc}")
        return jsonify({'error': 'Ошибка регистрации'}), 500


@bp.route('/api/login', methods=['POST'])
@cross_origin()
def login():
    """User login."""
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        logger.info(f"Login attempt: {email}")

        if not email or not password:
            return jsonify({'error': 'Email и пароль обязательны'}), 400

        user = User.query.filter_by(email=email).first()
        if not user:
            logger.warning(f"User not found: {email}")
            return jsonify({'error': 'Неверный email или пароль'}), 401

        if not verify_password(password, user.password_hash):
            logger.warning(f"Invalid password for user: {email}")
            return jsonify({'error': 'Неверный email или пароль'}), 401

        if password_needs_upgrade(user.password_hash):
            user.password_hash = hash_password(password)

        token = Token(
            token=generate_token(),
            user_id=user.id,
            expires_at=datetime.now() + timedelta(days=30),
        )

        db.session.add(token)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Вход успешен',
            'token': token.token,
            'user': {
                'id': user.id,
                'name': user.name,
                'email': user.email,
                'phone': user.phone,
                'children': user.children or [],
                'registered_at': user.registered_at.isoformat(),
            },
        })

    except Exception as exc:
        db.session.rollback()
        logger.error(f"Login failed: {exc}")
        return jsonify({'error': 'Ошибка входа'}), 500


@bp.route('/api/admin/login', methods=['POST'])
@cross_origin()
def admin_login():
    """Administrator login."""
    try:
        data = request.get_json()
        logger.info(f"Admin login attempt: {data.get('username')}")

        if not data.get('username') or not data.get('password'):
            return jsonify({'error': 'Требуется имя пользователя и пароль'}), 400

        admin_username = (current_app.config.get('ADMIN_USERNAME') or '').strip()
        admin_password = current_app.config.get('ADMIN_PASSWORD')
        admin_password_hash = current_app.config.get('ADMIN_PASSWORD_HASH')

        if not admin_username or (not admin_password and not admin_password_hash):
            logger.error("Admin credentials are not configured")
            return jsonify({
                'error': 'Админская учетная запись не настроена. Укажите ADMIN_USERNAME и ADMIN_PASSWORD или ADMIN_PASSWORD_HASH в окружении сервера.'
            }), 503

        username_matches = compare_digest(data['username'], admin_username)
        if admin_password_hash:
            password_matches = verify_password(data['password'], admin_password_hash)
        else:
            password_matches = compare_digest(data['password'], admin_password)

        if not (username_matches and password_matches):
            logger.warning(f"Invalid admin credentials: {data.get('username')}")
            return jsonify({'error': 'Неверные учетные данные'}), 401

        token = generate_token()
        Token.query.filter_by(user_id=0).delete()

        admin_token = Token(
            token=token,
            user_id=0,
            expires_at=datetime.now() + timedelta(hours=8),
        )
        db.session.add(admin_token)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Авторизация успешна',
            'token': token,
            'user': {
                'username': admin_username,
                'role': 'admin',
            },
        })

    except Exception as exc:
        db.session.rollback()
        logger.error(f"Admin login failed: {exc}")
        return jsonify({'error': 'Ошибка авторизации'}), 500
