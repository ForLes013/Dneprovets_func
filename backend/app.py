import logging
import os
import secrets

from flask import Flask, send_from_directory
from flask_cors import CORS
from flask_mail import Mail
from sqlalchemy import inspect, text

from models import db
from utils import cleanup_expired_tokens

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def get_bool_env(name, default=False):
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {'1', 'true', 'yes', 'on'}


def get_int_env(name, default):
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def load_env_file(env_path):
    if not os.path.exists(env_path):
        return

    with open(env_path, "r", encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")

            if key and key not in os.environ:
                os.environ[key] = value


application = Flask(__name__, static_folder='client/build')
app = application
base_dir = os.path.dirname(os.path.abspath(__file__))
client_folder = os.path.join(base_dir, "client")
build_folder = os.path.join(client_folder, "build")
default_db_path = os.path.join(base_dir, "football_school.db")
load_env_file(os.path.join(base_dir, ".env"))


def ensure_database_schema():
    """Simple migration for the current SQLite schema without Alembic."""
    inspector = inspect(db.engine)

    if 'branches' not in inspector.get_table_names():
        return

    branch_columns = {column['name'] for column in inspector.get_columns('branches')}
    if 'photo_data' not in branch_columns:
        db.session.execute(text('ALTER TABLE branches ADD COLUMN photo_data TEXT'))
        db.session.commit()
        logger.info("Added branches.photo_data column")

    if 'payments' in inspector.get_table_names():
        payment_columns = {column['name'] for column in inspector.get_columns('payments')}
        payment_column_migrations = {
            'provider': 'ALTER TABLE payments ADD COLUMN provider VARCHAR(50)',
            'provider_payment_id': 'ALTER TABLE payments ADD COLUMN provider_payment_id VARCHAR(120)',
            'provider_status': 'ALTER TABLE payments ADD COLUMN provider_status VARCHAR(50)',
            'provider_confirmation_url': 'ALTER TABLE payments ADD COLUMN provider_confirmation_url TEXT',
            'provider_idempotence_key': 'ALTER TABLE payments ADD COLUMN provider_idempotence_key VARCHAR(120)',
            'provider_payload': 'ALTER TABLE payments ADD COLUMN provider_payload TEXT',
            'paid_at': 'ALTER TABLE payments ADD COLUMN paid_at DATETIME',
        }

        for column_name, statement in payment_column_migrations.items():
            if column_name not in payment_columns:
                db.session.execute(text(statement))
                db.session.commit()
                logger.info("Added payments.%s column", column_name)


CORS(application)

secret_key = os.getenv('SECRET_KEY') or os.getenv('FLASK_SECRET_KEY')
if not secret_key:
    secret_key = secrets.token_urlsafe(32)
    logger.warning("SECRET_KEY is not configured; generated a temporary key for this process")

application.config['SQLALCHEMY_DATABASE_URI'] = os.getenv(
    'DATABASE_URL',
    f"sqlite:///{default_db_path.replace(os.sep, '/')}",
)
application.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
application.config['SECRET_KEY'] = secret_key
application.config['MAIL_SERVER'] = os.getenv('MAIL_SERVER', 'localhost')
application.config['MAIL_PORT'] = get_int_env('MAIL_PORT', 25)
application.config['MAIL_USE_TLS'] = get_bool_env('MAIL_USE_TLS', False)
application.config['MAIL_USE_SSL'] = get_bool_env('MAIL_USE_SSL', False)
application.config['MAIL_USERNAME'] = os.getenv('MAIL_USERNAME')
application.config['MAIL_PASSWORD'] = os.getenv('MAIL_PASSWORD')
application.config['MAIL_DEFAULT_SENDER'] = os.getenv('MAIL_DEFAULT_SENDER') or application.config['MAIL_USERNAME']
application.config['ADMIN_USERNAME'] = os.getenv('ADMIN_USERNAME')
application.config['ADMIN_PASSWORD'] = os.getenv('ADMIN_PASSWORD')
application.config['ADMIN_PASSWORD_HASH'] = os.getenv('ADMIN_PASSWORD_HASH')
application.config['PAYMENTS_PROVIDER'] = (os.getenv('PAYMENTS_PROVIDER') or 'manual').strip().lower()
application.config['PAYMENT_RETURN_URL'] = os.getenv('PAYMENT_RETURN_URL')
application.config['YOOKASSA_API_BASE_URL'] = os.getenv('YOOKASSA_API_BASE_URL', 'https://api.yookassa.ru/v3').rstrip('/')
application.config['YOOKASSA_SHOP_ID'] = os.getenv('YOOKASSA_SHOP_ID')
application.config['YOOKASSA_SECRET_KEY'] = os.getenv('YOOKASSA_SECRET_KEY')

if not application.config['ADMIN_USERNAME'] or (
    not application.config['ADMIN_PASSWORD'] and not application.config['ADMIN_PASSWORD_HASH']
):
    logger.warning(
        "Admin credentials are not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD or ADMIN_PASSWORD_HASH."
    )

if application.config['PAYMENTS_PROVIDER'] == 'yookassa' and (
    not application.config['YOOKASSA_SHOP_ID'] or not application.config['YOOKASSA_SECRET_KEY']
):
    logger.warning(
        "PAYMENTS_PROVIDER=yookassa, but YOOKASSA_SHOP_ID or YOOKASSA_SECRET_KEY is missing."
    )

db.init_app(application)
mail = Mail(application)

from routes.auth import bp as auth_bp
from routes.user import bp as user_bp
from routes.public import bp as public_bp
from routes.admin import bp as admin_bp

application.register_blueprint(auth_bp)
application.register_blueprint(user_bp)
application.register_blueprint(public_bp)
application.register_blueprint(admin_bp)

with application.app_context():
    db.create_all()
    ensure_database_schema()
    logger.info("Database tables are ready")
    cleanup_expired_tokens()


@application.route('/', defaults={'path': ''})
@application.route('/<path:path>')
def serve(path):
    """Serve static files for the React app."""
    if path and os.path.exists(os.path.join(build_folder, path)):
        return send_from_directory(build_folder, path)
    return send_from_directory(build_folder, 'index.html')


if __name__ == '__main__':
    host = os.getenv('HOST', '0.0.0.0')
    port = get_int_env('PORT', 5000)
    debug_mode = get_bool_env('FLASK_DEBUG', False)
    application.run(debug=debug_mode, host=host, port=port)
