# utils.py
import calendar
from copy import deepcopy
import hashlib
import json
import logging
import os
import re
import secrets
from datetime import datetime, timedelta
from functools import wraps
from hmac import compare_digest

from flask import jsonify, request
from models import AgeSchedule, Branch, SiteSetting
from werkzeug.security import check_password_hash, generate_password_hash

logger = logging.getLogger(__name__)
LEGACY_SHA256_RE = re.compile(r"^[a-f0-9]{64}$")
PASSWORD_HASH_METHOD = "pbkdf2:sha256:600000"
YEAR_RANGE_RE = re.compile(r"^\s*(\d{4})\s*[-]\s*(\d{4})\s*$")
PAYMENT_PLAN_ID_RE = re.compile(r"[^a-zA-Z0-9_-]+")

DEFAULT_CONTACT_INFO = {
    "phone": "+7 (999) 123-45-67",
    "email": "info@dneprovets.ru",
    "address": "ул. Центральная, 15",
    "working_hours": "Пн-Вс: 08:00-22:00",
}

DEFAULT_TRAINERS = [
    {
        "name": "Алексей Иванов",
        "title": "Главный тренер",
        "description": "UEFA C, специализация по детской подготовке и игровому мышлению.",
    },
    {
        "name": "Дмитрий Смирнов",
        "title": "Тренер младших групп",
        "description": "Работает с адаптацией новичков и базовой техникой детей 6-10 лет.",
    },
    {
        "name": "Максим Орлов",
        "title": "Тренер старших групп",
        "description": "Фокус на командных взаимодействиях, дисциплине и подготовке к матчам.",
    },
]

DEFAULT_PAYMENT_PLANS = [
    {
        "id": "basic",
        "name": "Базовый",
        "trainings": 8,
        "price": 4000,
        "description": "2 тренировки в неделю",
    },
    {
        "id": "standard",
        "name": "Стандартный",
        "trainings": 12,
        "price": 5500,
        "description": "3 тренировки в неделю",
    },
    {
        "id": "full",
        "name": "Полный",
        "trainings": 16,
        "price": 7000,
        "description": "4 тренировки в неделю",
    },
    {
        "id": "individual",
        "name": "Индивидуальный",
        "trainings": 4,
        "price": 2500,
        "description": "1 тренировка в неделю",
    },
]

DEFAULT_ACHIEVEMENTS = {
    "title": "Наши достижения",
    "intro": "Показываем не обещания, а конкретные результаты школы, команд и воспитанников.",
    "items": [
        {
            "value": "12+",
            "title": "лет работы",
            "description": "Системно развиваем детей и подростков в футбольной среде.",
        },
        {
            "value": "350+",
            "title": "воспитанников",
            "description": "Через тренировки школы прошли сотни детей разных возрастов.",
        },
        {
            "value": "40+",
            "title": "турниров в год",
            "description": "Регулярно даем детям игровую практику и соревновательный опыт.",
        },
        {
            "value": "1",
            "title": "единая методика",
            "description": "Тренировочный процесс выстроен от младших групп до старших.",
        },
    ],
    "news": [],
}


def normalize_birth_year(value):
    try:
        year = int(str(value).strip())
    except (TypeError, ValueError, AttributeError):
        return None

    current_year = datetime.now().year + 1
    if year < 1900 or year > current_year:
        return None

    return year


def parse_age_group_range(age_group):
    if not age_group:
        return (None, None)

    raw_value = str(age_group).strip()
    if not raw_value:
        return (None, None)

    normalized = (
        raw_value.lower()
        .replace("–", "-")
        .replace("—", "-")
        .replace("−", "-")
    )
    compact = re.sub(r"\s+", "", normalized)

    if compact.endswith("+"):
        max_year = normalize_birth_year(compact[:-1])
        return (None, max_year) if max_year else (None, None)

    if "старше" in compact or "раньше" in compact:
        year_match = re.search(r"(\d{4})", compact)
        max_year = normalize_birth_year(year_match.group(1)) if year_match else None
        return (None, max_year) if max_year else (None, None)

    exact_match = YEAR_RANGE_RE.fullmatch(normalized)
    if exact_match:
        first_year = normalize_birth_year(exact_match.group(1))
        second_year = normalize_birth_year(exact_match.group(2))
        if first_year and second_year:
            return tuple(sorted((first_year, second_year)))

    single_year = normalize_birth_year(compact)
    if single_year:
        return (single_year, single_year)

    return (None, None)


def format_age_group_range(start_year, end_year, fallback=None):
    start_year = normalize_birth_year(start_year)
    end_year = normalize_birth_year(end_year)

    if start_year and end_year:
        if start_year > end_year:
            start_year, end_year = end_year, start_year
        return str(start_year) if start_year == end_year else f"{start_year}-{end_year}"

    if end_year and not start_year:
        return f"{end_year} и старше"

    if start_year and not end_year:
        return str(start_year)

    return fallback or ""


def get_age_group_sort_key(age_group):
    start_year, end_year = parse_age_group_range(age_group)
    start_key = start_year if start_year is not None else 0
    end_key = end_year if end_year is not None else start_key
    return (start_key, end_key, str(age_group or ""))


def schedule_matches_birth_year(schedule, birth_year):
    normalized_birth_year = normalize_birth_year(birth_year)
    if not normalized_birth_year or not schedule:
        return False

    start_year, end_year = parse_age_group_range(getattr(schedule, "age_group", None))
    if start_year is None and end_year is None:
        legacy_group = get_age_group_from_birth_year(normalized_birth_year)
        return legacy_group == getattr(schedule, "age_group", None)

    if start_year is not None and normalized_birth_year < start_year:
        return False

    if end_year is not None and normalized_birth_year > end_year:
        return False

    return True


def filter_schedules_by_birth_year(schedules, birth_year):
    matched_schedules = [
        schedule for schedule in (schedules or []) if schedule_matches_birth_year(schedule, birth_year)
    ]
    return sorted(
        matched_schedules,
        key=lambda schedule: (
            get_age_group_sort_key(getattr(schedule, "age_group", "")),
            getattr(schedule, "time", ""),
            getattr(schedule, "id", 0),
        ),
    )


def get_site_setting_value(key, default):
    setting = SiteSetting.query.filter_by(key=key).first()
    if not setting:
        return deepcopy(default)

    if setting.value in (None, ""):
        return deepcopy(default)

    return deepcopy(setting.value)


def set_site_setting_value(key, value):
    from models import db

    setting = SiteSetting.query.filter_by(key=key).first()
    if setting:
        setting.value = value
    else:
        setting = SiteSetting(key=key, value=value)
        db.session.add(setting)

    return setting

# Функции для паролей и токенов
def normalize_payment_plan_identifier(value, fallback):
    raw_value = str(value or fallback or "").strip().lower()
    normalized_value = PAYMENT_PLAN_ID_RE.sub("-", raw_value).strip("-")
    if normalized_value:
        return normalized_value

    fallback_value = str(fallback or "plan").strip().lower()
    return fallback_value or "plan"


def normalize_payment_plan_number(value, minimum=0):
    try:
        normalized_value = int(str(value).strip())
    except (TypeError, ValueError, AttributeError):
        return None

    return normalized_value if normalized_value >= minimum else None


def normalize_payment_plans_payload(payload):
    if payload is None:
        return deepcopy(DEFAULT_PAYMENT_PLANS)

    if not isinstance(payload, list):
        raise ValueError("Список тарифов должен быть массивом")

    normalized_plans = []
    used_ids = set()

    for index, item in enumerate(payload[:50]):
        if not isinstance(item, dict):
            continue

        fallback_id = f"plan-{index + 1}"
        plan_id = normalize_payment_plan_identifier(item.get("id"), fallback_id)
        if plan_id in used_ids:
            duplicate_index = 2
            next_plan_id = f"{plan_id}-{duplicate_index}"
            while next_plan_id in used_ids:
                duplicate_index += 1
                next_plan_id = f"{plan_id}-{duplicate_index}"
            plan_id = next_plan_id

        name = str(item.get("name") or "").strip()
        description = str(item.get("description") or "").strip()
        trainings = normalize_payment_plan_number(item.get("trainings"), minimum=1)
        price = normalize_payment_plan_number(item.get("price"), minimum=0)

        if not any([name, description, trainings is not None, price is not None]):
            continue

        display_name = name or f"Тариф {index + 1}"
        if not name:
            raise ValueError(f'Укажите название для тарифа "{display_name}"')

        if trainings is None:
            raise ValueError(
                f'Укажите корректное количество тренировок для тарифа "{display_name}"'
            )

        if price is None:
            raise ValueError(
                f'Укажите корректную стоимость для тарифа "{display_name}"'
            )

        normalized_plans.append(
            {
                "id": plan_id,
                "name": name,
                "trainings": trainings,
                "price": price,
                "description": description,
            }
        )
        used_ids.add(plan_id)

    if not normalized_plans:
        raise ValueError("Добавьте хотя бы один тариф тренировок")

    return normalized_plans


def hash_password(password):
    return generate_password_hash(password, method=PASSWORD_HASH_METHOD)


def is_legacy_password_hash(password_hash):
    if not isinstance(password_hash, str):
        return False
    return bool(LEGACY_SHA256_RE.fullmatch(password_hash.lower()))

def verify_password(password, password_hash):
    if not password_hash:
        return False

    if is_legacy_password_hash(password_hash):
        legacy_hash = hashlib.sha256(password.encode()).hexdigest()
        return compare_digest(legacy_hash, password_hash.lower())

    try:
        return check_password_hash(password_hash, password)
    except ValueError:
        logger.warning("⚠️ Не удалось проверить пароль: неподдерживаемый формат хеша")
        return False


def password_needs_upgrade(password_hash):
    return is_legacy_password_hash(password_hash)

def generate_token():
    return secrets.token_urlsafe(32)


def generate_child_id(child_data, user_id):
    raw_value = (
        f"{user_id or 0}:{child_data.get('name', '')}:{child_data.get('birth_year', '')}"
    )
    digest = hashlib.sha1(raw_value.encode("utf-8")).hexdigest()
    return int(digest[:8], 16)


def normalize_children_payload(children_data, user_id):
    if not isinstance(children_data, list):
        return []

    normalized_children = []
    for child in children_data:
        if not isinstance(child, dict):
            continue

        child_copy = child.copy()
        child_id = child_copy.get('id')
        birth_year = normalize_birth_year(child_copy.get('birth_year'))
        branch_id = child_copy.get('branch_id')

        if isinstance(child_id, str) and child_id.isdigit():
            child_copy['id'] = int(child_id)
        elif isinstance(child_id, int):
            child_copy['id'] = child_id
        else:
            child_copy['id'] = generate_child_id(child_copy, user_id)

        if birth_year is not None:
            child_copy['birth_year'] = birth_year
        else:
            child_copy.pop('birth_year', None)

        if isinstance(branch_id, str) and branch_id.isdigit():
            branch_id = int(branch_id)

        if isinstance(branch_id, int):
            branch = Branch.query.get(branch_id)
            if branch:
                child_copy['branch_id'] = branch.id
                child_copy['branch_name'] = branch.name
            else:
                child_copy.pop('branch_id', None)
                child_copy.pop('branch_name', None)
        else:
            child_copy.pop('branch_id', None)
            child_copy.pop('branch_name', None)

        normalized_children.append(child_copy)

    return normalized_children

# Декораторы авторизации
# В utils.py исправить login_required:
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token_str = request.headers.get('Authorization')
        if not token_str:
            return jsonify({'error': 'Требуется авторизация'}), 401
        
        try:
            token_str = token_str.replace('Bearer ', '')
            from models import db, Token
            token = Token.query.filter_by(token=token_str).first()
            
            if not token:
                return jsonify({'error': 'Недействительный токен'}), 401
            
            if token.expires_at < datetime.now():
                db.session.delete(token)
                db.session.commit()
                return jsonify({'error': 'Токен истек'}), 401
            
            # Обновляем время жизни токена
            token.expires_at = datetime.now() + timedelta(days=30)
            db.session.commit()
            
            # Добавляем user_id в request для использования в функциях
            request.user_id = token.user_id
            
        except Exception as e:
            logger.error(f"❌ Ошибка проверки токена: {str(e)}")
            return jsonify({'error': 'Ошибка авторизации'}), 401
        
        # Вызываем оригинальную функцию
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token_str = request.headers.get('Authorization')
        if not token_str:
            logger.error("❌ Отсутствует заголовок Authorization")
            return jsonify({'error': 'Требуется авторизация'}), 401
        
        try:
            token_str = token_str.replace('Bearer ', '')
            from models import db, Token
            token = Token.query.filter_by(token=token_str).first()
            
            if not token:
                logger.error(f"❌ Токен не найден: {token_str[:20]}...")
                return jsonify({'error': 'Недействительный токен'}), 401
            
            # Проверяем, что user_id = 0 (администратор)
            if token.expires_at < datetime.now():
                db.session.delete(token)
                db.session.commit()
                logger.warning("Expired admin token was rejected")
                return jsonify({'error': 'Token expired'}), 401

            if token.user_id != 0:
                logger.warning(f"⚠️ Попытка доступа без прав администратора: user_id={token.user_id}")
                return jsonify({'error': 'Доступ запрещен. Требуются права администратора'}), 403
            
            # Обновляем время жизни токена
            token.expires_at = datetime.now() + timedelta(hours=8)
            db.session.commit()
                
        except Exception as e:
            logger.error(f"❌ Ошибка проверки прав администратора: {str(e)}")
            return jsonify({'error': 'Ошибка проверки прав'}), 401
        
        return f(*args, **kwargs)
    return decorated_function

# Функции для email
def create_email_message(form_data):
    """Создание email сообщения с данными из формы"""
    
    subject = f"Новая заявка с сайта: {form_data.get('name', 'Без имени')}"
    
    body = f"""
🎯 НОВАЯ ЗАЯВКА С САЙТА ФУТБОЛЬНОЙ ШКОЛЫ "ДНЕПРОВЕЦ"

👤 КОНТАКТНАЯ ИНФОРМАЦИЯ:
• Имя родителя: {form_data.get('name', 'Не указано')}
• Телефон: {form_data.get('phone', 'Не указан')}
• Email: {form_data.get('email', 'Не указан')}

👶 ИНФОРМАЦИЯ О РЕБЕНКЕ:
• Имя ребенка: {form_data.get('childName', 'Не указано')}
• Год рождения: {form_data.get('birthYear', 'Не указан')}
• Филиал: {form_data.get('branch_name', 'Не указан')}

💬 ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ:
{form_data.get('message', 'Не указано')}

📅 Время заявки: {datetime.now().strftime('%d.%m.%Y %H:%M:%S')}
---
Автоматическое сообщение с сайта Футбольной школы "Днепровец"
"""
    
    return subject, body

def save_application_to_file(form_data):
    """Дублируем сохранение в файл для надежности"""
    try:
        os.makedirs('applications', exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"applications/application_{timestamp}.txt"
        
        with open(filename, 'w', encoding='utf-8') as f:
            f.write("ЗАЯВКА С САЙТА\n")
            f.write("=" * 50 + "\n")
            f.write(f"Время: {datetime.now().strftime('%d.%m.%Y %H:%M:%S')}\n")
            f.write(f"Имя: {form_data.get('name', 'Не указано')}\n")
            f.write(f"Телефон: {form_data.get('phone', 'Не указан')}\n")
            f.write(f"Email: {form_data.get('email', 'Не указан')}\n")
            f.write(f"Имя ребенка: {form_data.get('childName', 'Не указано')}\n")
            f.write(f"Год рождения: {form_data.get('birthYear', 'Не указан')}\n")
            f.write(f"Филиал: {form_data.get('branch_name', 'Не указан')}\n")
            f.write(f"Сообщение: {form_data.get('message', 'Не указан')}\n")
            f.write("=" * 50 + "\n")
        
        logger.info(f"✅ Заявка сохранена в файл: {filename}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Ошибка сохранения в файл: {str(e)}")
        return False

def log_to_console(form_data):
    """Выводим заявку в консоль"""
    print("\n" + "🎯" * 30)
    print("🚀 НОВАЯ ЗАЯВКА С САЙТА")
    print("🎯" * 30)
    print(f"📅 Время: {datetime.now().strftime('%H:%M:%S %d.%m.%Y')}")
    print(f"👤 Имя: {form_data.get('name', 'Не указано')}")
    print(f"📞 Телефон: {form_data.get('phone', 'Не указан')}")
    print(f"📧 Email: {form_data.get('email', 'Не указан')}")
    print(f"👶 Имя ребенка: {form_data.get('childName', 'Не указано')}")
    print(f"🎂 Год рождения: {form_data.get('birthYear', 'Не указан')}")
    print(f"🏟️ Филиал: {form_data.get('branch_name', 'Не указан')}")
    print(f"💬 Сообщение: {form_data.get('message', 'Не указан')}")
    print("🎯" * 30)

# Функции для работы с датами и группами
def get_age_group_from_birth_year(birth_year):
    """Определение возрастной группы по году рождения"""
    try:
        current_year = datetime.now().year
        age = current_year - birth_year
        
        # Ваши возрастные группы - поправьте под вашу систему
        if birth_year >= 2020:
            return "2020-2021"
        elif birth_year >= 2018:
            return "2018-2019"
        elif birth_year >= 2016:
            return "2016-2017"
        elif birth_year >= 2014:
            return "2014-2015"
        elif birth_year >= 2012:
            return "2012-2013"
        elif birth_year >= 2010:
            return "2010-2011"
        else:
            return "2009-старше"
            
    except Exception as e:
        logger.error(f"❌ Ошибка определения возрастной группы: {str(e)}")
        return None

def get_birth_year_group(birth_year):
    """Получение группы по году рождения (например, 2018-2019)"""
    if not birth_year:
        return None
    
    try:
        if birth_year >= 2020:
            return "2020-2021"
        elif birth_year >= 2018:
            return "2018-2019"
        elif birth_year >= 2016:
            return "2016-2017"
        elif birth_year >= 2014:
            return "2014-2015"
        else:
            return "2013 и ранее"
    except:
        return None

def get_user_children(user):
    """Безопасно возвращает список детей пользователя."""
    if not user or not getattr(user, 'children', None):
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

def get_child_info(user, child_id):
    """Возвращает данные ребенка пользователя по ID."""
    for child in get_user_children(user):
        try:
            if int(child.get('id')) == int(child_id):
                return child
        except (TypeError, ValueError, AttributeError):
            continue
    return None

def parse_days_of_week(days_of_week):
    """Нормализует список дней недели из БД."""
    if isinstance(days_of_week, list):
        return [int(day) for day in days_of_week if str(day).isdigit()]

    if isinstance(days_of_week, str):
        try:
            parsed_days = json.loads(days_of_week)
            if isinstance(parsed_days, list):
                return [int(day) for day in parsed_days if str(day).isdigit()]
        except Exception:
            return []

    return []

def build_training_datetime(base_date, time_str, default_hour=17, default_minute=0):
    """Собирает datetime тренировки из даты и времени расписания."""
    if not isinstance(base_date, datetime):
        raise ValueError('base_date должен быть datetime')

    hours = default_hour
    minutes = default_minute

    if isinstance(time_str, str) and ':' in time_str:
        try:
            hours_str, minutes_str = time_str.split(':', 1)
            hours = int(hours_str)
            minutes = int(minutes_str)
        except (TypeError, ValueError):
            hours = default_hour
            minutes = default_minute

    return base_date.replace(
        hour=hours,
        minute=minutes,
        second=0,
        microsecond=0
    )

def sync_payment_counters(payment):
    """Пересчитывает счетчики оплаты по фактически посещенным занятиям."""
    if not payment:
        return None

    from models import Attendance

    attended_count = Attendance.query.filter(
        Attendance.payment_id == payment.id,
        Attendance.status == 'attended',
        Attendance.is_free == False
    ).count()

    payment.used_trainings = attended_count
    payment.remaining_trainings = max(0, payment.training_count - attended_count)
    return payment

def create_attendance_records(user_id, child_id, payment_id, start_date, end_date, training_count, birth_year, branch_id):
    """Создает записи посещений на основе расписания возрастной группы и филиала"""
    try:
        from models import db, AgeSchedule, Attendance
        
        # Определяем возрастную группу по году рождения
        age_group = get_age_group_from_birth_year(birth_year)
        if not age_group:
            logger.error(f"❌ Не удалось определить возрастную группу для года рождения: {birth_year}")
            return False
        
        logger.info(f"📅 Создание записей посещений: child_id={child_id}, возрастная группа={age_group}, филиал={branch_id}, тренировок={training_count}")
        
        # Получаем активное расписание для этой возрастной группы в филиале
        schedules = AgeSchedule.query.filter_by(
            branch_id=branch_id,
            age_group=age_group,
            is_active=True
        ).order_by(AgeSchedule.time).all()
        
        if not schedules:
            logger.error(f"❌ Нет активного расписания для филиала {branch_id} и возрастной группы {age_group}")
            return False
        
        logger.info(f"📋 Найдено расписаний: {len(schedules)}")

        schedule_by_day = {}
        for schedule in schedules:
            parsed_days = parse_days_of_week(schedule.days_of_week)
            for day_of_week in parsed_days:
                if day_of_week not in schedule_by_day:
                    schedule_by_day[day_of_week] = []
                schedule_by_day[day_of_week].append(schedule)
                logger.info(
                    f"   - День {day_of_week} ({['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][day_of_week]}) в {schedule.time}"
                )
        
        # Создаем тренировки по расписанию
        created_count = 0
        training_dates = []
        
        # Начинаем с start_date и идем до end_date или пока не создадим все тренировки
        current_date = start_date
        
        # Чтобы избежать вечного цикла, ограничим количество итераций
        max_iterations = 100
        iteration = 0
        
        while created_count < training_count and iteration < max_iterations:
            iteration += 1
            
            # Проверяем, не вышли ли за границы периода
            if current_date > end_date:
                logger.warning(f"⚠️ Период закончился, но нужно создать еще {training_count - created_count} тренировок")
                break
            
            day_of_week = current_date.weekday()  # 0=понедельник, 6=воскресенье
            
            # Проверяем, есть ли расписание на этот день недели
            if day_of_week in schedule_by_day:
                # Берем первое расписание на этот день
                schedule = schedule_by_day[day_of_week][0]
                training_date = build_training_datetime(current_date, schedule.time)
                
                # Проверяем, чтобы тренировка была не в прошлом (относительно текущего времени)
                # Но не блокируем, так как это может быть для прошедшего периода
                
                training_dates.append({
                    'date': training_date,
                    'age_group': schedule.age_group,
                    'branch_id': branch_id,
                    'schedule_id': schedule.id,
                    'notes': f"Тренировка {created_count + 1}/{training_count}"
                })
                created_count += 1
                
                # Логируем создание тренировки
                logger.info(f"   ✅ Создана тренировка на {training_date.strftime('%d.%m.%Y %H:%M')} (день недели: {day_of_week})")
            
            # Переходим к следующему дню
            current_date += timedelta(days=1)
            
            # Если прошли неделю и не нашли подходящих дней, выходим
            if iteration % 7 == 0 and created_count == 0:
                logger.error(f"❌ Не удалось создать ни одной тренировки за неделю")
                break
        
        # Если все же не удалось создать все тренировки, создаем оставшиеся в ближайшие дни с расписанием
        if created_count < training_count:
            remaining = training_count - created_count
            logger.warning(f"⚠️ Создано только {created_count} из {training_count} тренировок. Дополняем...")
            
            # Ищем ближайшие дни с расписанием
            current_date = start_date
            added_count = 0
            
            while added_count < remaining and iteration < max_iterations * 2:
                day_of_week = current_date.weekday()
                
                if day_of_week in schedule_by_day:
                    schedule = schedule_by_day[day_of_week][0]
                    training_date = build_training_datetime(current_date, schedule.time)
                    
                    # Проверяем, нет ли уже тренировки на эту дату
                    date_exists = False
                    for existing in training_dates:
                        if existing['date'].date() == training_date.date():
                            date_exists = True
                            break
                    
                    if not date_exists:
                        training_dates.append({
                            'date': training_date,
                            'age_group': schedule.age_group,
                            'branch_id': branch_id,
                            'schedule_id': schedule.id,
                            'notes': f"Тренировка {created_count + added_count + 1}/{training_count} (дополнительная)"
                        })
                        added_count += 1
                        logger.info(f"   ➕ Дополнительная тренировка на {training_date.strftime('%d.%m.%Y %H:%M')}")
                
                current_date += timedelta(days=1)
                iteration += 1
        
        # Создаем записи посещений
        for i, training in enumerate(training_dates):
            attendance = Attendance(
                user_id=user_id,
                child_id=child_id,
                payment_id=payment_id,
                schedule_id=training.get('schedule_id'),
                scheduled_date=training['date'],
                age_group=training['age_group'],
                branch_id=branch_id,
                status='scheduled',
                notes=training.get('notes', f"Тренировка {i + 1}/{training_count}")
            )
            db.session.add(attendance)
        
        db.session.commit()
        logger.info(f"✅ Создано {len(training_dates)} записей посещений для ребенка {child_id}")
        
        # Логируем созданные даты
        for i, t in enumerate(training_dates):
            logger.info(f"   {i+1}. {t['date'].strftime('%d.%m.%Y %H:%M')} - {t['age_group']}")
        
        return True
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"❌ Ошибка создания записей посещений: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False

def get_available_makeup_dates(child_id, user_id):
    """Возвращает доступные даты для отработки"""
    try:
        available_dates = []
        today = datetime.now()
        
        for i in range(1, 15):
            next_date = today + timedelta(days=i)
            if next_date.weekday() in [0, 2, 4]:
                available_dates.append({
                    'date': next_date.replace(hour=16, minute=0).isoformat(),
                    'time': '16:00',
                    'display': next_date.strftime('%d.%m.%Y в 16:00')
                })
        
        return available_dates
        
    except Exception as e:
        logger.error(f"❌ Ошибка получения доступных дат: {str(e)}")
        return []

def get_available_reschedule_dates(child_id, user_id):
    """Возвращает доступные даты для переноса пропущенной тренировки"""
    try:
        from models import Attendance, User, AgeSchedule
        
        available_dates = []
        today = datetime.now()
        
        # Получаем все запланированные тренировки для этого ребенка
        scheduled_attendances = Attendance.query.filter(
            Attendance.child_id == child_id,
            Attendance.user_id == user_id,
            Attendance.status == 'scheduled',
            Attendance.scheduled_date > today
        ).order_by(Attendance.scheduled_date).all()
        
        # Получаем все даты, когда у ребенка уже есть тренировки
        busy_dates = []
        for attendance in scheduled_attendances:
            busy_dates.append(attendance.scheduled_date.date())
        
        # Получаем год рождения ребенка
        user = User.query.get(user_id)
        birth_year = None
        if user and user.children:
            for child in user.children:
                if child.get('id') == child_id:
                    birth_year = child.get('birth_year')
                    break
        
        if birth_year:
            age_group = get_age_group_from_birth_year(birth_year)
            # Получаем расписание для возрастной группы
            schedules = AgeSchedule.query.filter_by(
                age_group=age_group,
                is_active=True
            ).all() if age_group else []
            
            # Ищем ближайшие свободные даты по расписанию
            for i in range(1, 31):
                next_date = today + timedelta(days=i)
                
                # Проверяем, есть ли расписание на этот день недели
                for schedule in schedules:
                    if next_date.weekday() == schedule.day_of_week:
                        # Проверяем, что на эту дату у ребенка еще нет тренировки
                        if next_date.date() not in busy_dates:
                            time_parts = schedule.time.split(':')
                            training_date = next_date.replace(
                                hour=int(time_parts[0]),
                                minute=int(time_parts[1]),
                                second=0
                            )
                            available_dates.append({
                                'date': training_date.isoformat(),
                                'time': schedule.time,
                                'display': training_date.strftime('%d.%m.%Y в ') + schedule.time
                            })
                            break
        
        return available_dates[:10]
        
    except Exception as e:
        logger.error(f"❌ Ошибка получения доступных дат для переноса: {str(e)}")
        return []

def cleanup_expired_tokens():
    """Очистка просроченных токенов"""
    try:
        from models import db, Token
        expired_tokens = Token.query.filter(Token.expires_at < datetime.now()).all()
        for token in expired_tokens:
            db.session.delete(token)
        db.session.commit()
        if expired_tokens:
            logger.info(f"🗑️ Удалено {len(expired_tokens)} просроченных токенов")
    except Exception as e:
        logger.error(f"❌ Ошибка очистки токенов: {str(e)}")

def get_branches_by_birth_year(birth_year):
    """Получение филиалов, доступных для данного года рождения"""
    try:
        # Определяем возрастную группу по году рождения
        age_group = get_age_group_from_birth_year(birth_year)
        if not age_group:
            return []
        
        # Находим все расписания для этой возрастной группы
        schedules = AgeSchedule.query.filter_by(
            age_group=age_group,
            is_active=True
        ).all()
        
        # Получаем уникальные филиалы из расписаний
        branch_ids = set(schedule.branch_id for schedule in schedules)
        
        # Получаем информацию о филиалах
        branches = Branch.query.filter(
            Branch.id.in_(branch_ids),
            Branch.is_active == True
        ).all()
        
        return branches
        
    except Exception as e:
        logger.error(f"❌ Ошибка получения филиалов по году рождения: {str(e)}")
        return []

def get_branch_schedule_info(branch_id, birth_year):
    """Получение информации о расписании для филиала и года рождения"""
    try:
        age_group = get_age_group_from_birth_year(birth_year)
        if not age_group:
            return None
        
        schedules = AgeSchedule.query.filter_by(
            branch_id=branch_id,
            age_group=age_group,
            is_active=True
        ).order_by(AgeSchedule.day_of_week, AgeSchedule.time).all()
        
        if not schedules:
            return None
        
        # Форматируем расписание
        schedule_info = []
        days_map = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
        
        for schedule in schedules:
            schedule_info.append({
                'day': days_map[schedule.day_of_week],
                'time': schedule.time,
                'capacity': schedule.capacity
            })
        
        return schedule_info
        
    except Exception as e:
        logger.error(f"❌ Ошибка получения расписания филиала: {str(e)}")
        return None
