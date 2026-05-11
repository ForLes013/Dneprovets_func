import base64
import json
import secrets
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from urllib.request import Request, urlopen

from flask import current_app

from models import db, Attendance, AgeSchedule, Payment, User
from utils import (
    build_training_datetime,
    filter_schedules_by_birth_year,
    get_child_info,
    logger,
    normalize_birth_year,
    parse_days_of_week,
    sync_payment_counters,
)

ALLOWED_PAYMENT_STATUSES = {"pending", "confirmed", "failed"}


class PaymentProviderError(RuntimeError):
    pass


def get_payments_provider():
    return (current_app.config.get("PAYMENTS_PROVIDER") or "manual").strip().lower()


def is_real_payments_enabled():
    if get_payments_provider() != "yookassa":
        return False

    return bool(
        (current_app.config.get("YOOKASSA_SHOP_ID") or "").strip()
        and (current_app.config.get("YOOKASSA_SECRET_KEY") or "").strip()
    )


def _normalize_external_datetime(value):
    if not value or not isinstance(value, str):
        return None

    try:
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            return parsed
        return parsed.astimezone(timezone.utc).replace(tzinfo=None)
    except ValueError:
        return None


def _json_dumps(payload):
    try:
        return json.dumps(payload, ensure_ascii=False)
    except (TypeError, ValueError):
        return "{}"


def _append_query_params(url, **params):
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise PaymentProviderError("PAYMENT_RETURN_URL должен начинаться с http:// или https://")

    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    for key, value in params.items():
        if value is not None:
            query[key] = str(value)

    return urlunparse(parsed._replace(query=urlencode(query)))


def resolve_payment_return_url(local_payment_id, requested_url=None):
    base_url = (requested_url or current_app.config.get("PAYMENT_RETURN_URL") or "").strip()
    if not base_url:
        raise PaymentProviderError(
            "Не задан адрес возврата после оплаты. Укажите PAYMENT_RETURN_URL или передавайте return_url с фронтенда."
        )

    return _append_query_params(
        base_url,
        payment_id=local_payment_id,
        payment_result="return",
    )


def create_payment_attendance_records(payment, user):
    child_info = get_child_info(user, payment.child_id)
    if not child_info:
        raise ValueError("Ребенок для этой оплаты не найден")

    birth_year = child_info.get("birth_year")
    if not birth_year:
        raise ValueError("У ребенка не указан год рождения")

    if not payment.branch_id:
        raise ValueError("У оплаты не указан филиал")

    normalized_birth_year = normalize_birth_year(birth_year)
    if not normalized_birth_year:
        raise ValueError("Не удалось определить год рождения ребенка")

    schedules = filter_schedules_by_birth_year(
        AgeSchedule.query.filter_by(branch_id=payment.branch_id, is_active=True).all(),
        normalized_birth_year,
    )

    if not schedules:
        raise ValueError("Для ребенка нет активного расписания в выбранном филиале")

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
                status="scheduled",
                notes=f"Тренировка {len(existing_attendance) + created_count + 1}/{payment.training_count}",
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

    blocking_records = [record for record in attendance_records if record.status != "scheduled"]
    if blocking_records:
        raise ValueError(
            "Нельзя снять подтверждение оплаты, потому что по ней уже есть отмеченные или перенесенные посещения."
        )

    removed_count = len(attendance_records)
    for record in attendance_records:
        db.session.delete(record)

    return removed_count


def apply_local_payment_status(payment, new_status):
    if not payment:
        raise ValueError("Оплата не найдена")

    if new_status not in ALLOWED_PAYMENT_STATUSES:
        raise ValueError("Недопустимый статус оплаты")

    old_status = payment.status or "pending"
    payment.status = new_status

    result = {
        "old_status": old_status,
        "new_status": new_status,
        "created_attendance_count": 0,
        "removed_attendance_count": 0,
    }

    if old_status == "confirmed" and new_status != "confirmed":
        result["removed_attendance_count"] = remove_payment_attendance_records(payment)
        payment.used_trainings = 0
        payment.remaining_trainings = payment.training_count
    elif new_status != "confirmed":
        payment.used_trainings = 0
        payment.remaining_trainings = payment.training_count

    if old_status != "confirmed" and new_status == "confirmed":
        user = User.query.get(payment.user_id)
        if not user:
            raise ValueError("Пользователь для оплаты не найден")

        existing_attendance_count = Attendance.query.filter_by(payment_id=payment.id).count()
        created_count = create_payment_attendance_records(payment, user)
        result["created_attendance_count"] = created_count

        if existing_attendance_count == 0 and created_count == 0:
            raise ValueError(
                "Не удалось создать занятия по этой оплате. Проверьте филиал, расписание и данные ребенка."
            )

        sync_payment_counters(payment)

    if new_status == "confirmed":
        sync_payment_counters(payment)

    return result


def _yookassa_request(method, path, payload=None, idempotence_key=None):
    shop_id = (current_app.config.get("YOOKASSA_SHOP_ID") or "").strip()
    secret_key = (current_app.config.get("YOOKASSA_SECRET_KEY") or "").strip()
    api_base_url = (current_app.config.get("YOOKASSA_API_BASE_URL") or "https://api.yookassa.ru/v3").rstrip("/")

    if not shop_id or not secret_key:
        raise PaymentProviderError("Не заданы YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY")

    url = f"{api_base_url}{path}"
    auth_token = base64.b64encode(f"{shop_id}:{secret_key}".encode("utf-8")).decode("ascii")
    request_data = None if payload is None else json.dumps(payload).encode("utf-8")

    request_obj = Request(url, data=request_data, method=method.upper())
    request_obj.add_header("Authorization", f"Basic {auth_token}")
    request_obj.add_header("Accept", "application/json")
    if payload is not None:
        request_obj.add_header("Content-Type", "application/json")
    if idempotence_key:
        request_obj.add_header("Idempotence-Key", idempotence_key)

    try:
        with urlopen(request_obj, timeout=25) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        response_body = error.read().decode("utf-8", errors="ignore")
        message = response_body or str(error)
        try:
            payload = json.loads(response_body)
            message = (
                payload.get("description")
                or payload.get("message")
                or payload.get("type")
                or message
            )
        except (TypeError, ValueError, AttributeError):
            pass
        raise PaymentProviderError(f"ЮKassa вернула ошибку {error.code}: {message}") from error
    except URLError as error:
        raise PaymentProviderError(f"Не удалось соединиться с ЮKassa: {error.reason}") from error


def create_yookassa_payment(payment, *, return_url, description, customer_email=None):
    idempotence_key = payment.provider_idempotence_key or secrets.token_hex(16)
    amount_value = f"{int(payment.amount or 0):.2f}"
    payload = {
        "amount": {
            "value": amount_value,
            "currency": "RUB",
        },
        "capture": True,
        "confirmation": {
            "type": "redirect",
            "return_url": return_url,
        },
        "description": description,
        "metadata": {
            "local_payment_id": str(payment.id),
            "user_id": str(payment.user_id),
            "child_id": str(payment.child_id),
        },
    }

    if customer_email:
        payload["receipt"] = {
            "customer": {
                "email": customer_email,
            },
            "items": [
                {
                    "description": description[:128] or "Тренировки",
                    "quantity": "1.00",
                    "amount": {
                        "value": amount_value,
                        "currency": "RUB",
                    },
                    "vat_code": 1,
                    "payment_mode": "full_payment",
                    "payment_subject": "service",
                }
            ],
        }

    response = _yookassa_request("POST", "/payments", payload, idempotence_key=idempotence_key)

    payment.provider = "yookassa"
    payment.provider_payment_id = response.get("id")
    payment.provider_status = response.get("status")
    payment.provider_confirmation_url = (
        (response.get("confirmation") or {}).get("confirmation_url")
    )
    payment.provider_idempotence_key = idempotence_key
    payment.provider_payload = _json_dumps(response)
    payment.transaction_id = response.get("id") or payment.transaction_id

    return response


def get_yookassa_payment(provider_payment_id):
    return _yookassa_request("GET", f"/payments/{provider_payment_id}")


def map_provider_status_to_local_status(provider_status):
    normalized_status = str(provider_status or "").strip().lower()
    if normalized_status == "succeeded":
        return "confirmed"
    if normalized_status == "canceled":
        return "failed"
    return "pending"


def _find_payment_by_remote_object(remote_payment):
    if not isinstance(remote_payment, dict):
        return None

    provider_payment_id = str(remote_payment.get("id") or "").strip()
    if provider_payment_id:
        payment = Payment.query.filter_by(provider_payment_id=provider_payment_id).first()
        if payment:
            return payment

    metadata = remote_payment.get("metadata") or {}
    local_payment_id = metadata.get("local_payment_id")
    if local_payment_id and str(local_payment_id).isdigit():
        return Payment.query.get(int(local_payment_id))

    return None


def sync_local_payment_with_yookassa(payment, remote_payment=None):
    if not payment:
        raise ValueError("Оплата не найдена")

    if payment.provider != "yookassa":
        raise ValueError("Оплата не привязана к ЮKassa")

    if not payment.provider_payment_id and not remote_payment:
        raise ValueError("У оплаты нет внешнего идентификатора ЮKassa")

    resolved_remote_payment = remote_payment or get_yookassa_payment(payment.provider_payment_id)
    provider_payment_id = str(resolved_remote_payment.get("id") or "").strip()
    provider_status = str(resolved_remote_payment.get("status") or "").strip().lower()
    target_local_status = map_provider_status_to_local_status(provider_status)

    payment.provider = "yookassa"
    payment.provider_payment_id = provider_payment_id or payment.provider_payment_id
    payment.provider_status = provider_status
    payment.provider_confirmation_url = (
        (resolved_remote_payment.get("confirmation") or {}).get("confirmation_url")
        or payment.provider_confirmation_url
    )
    payment.provider_payload = _json_dumps(resolved_remote_payment)
    payment.transaction_id = provider_payment_id or payment.transaction_id

    paid_at = (
        _normalize_external_datetime(resolved_remote_payment.get("paid_at"))
        or _normalize_external_datetime(resolved_remote_payment.get("captured_at"))
    )
    if paid_at:
        payment.paid_at = paid_at

    transition_result = None
    if payment.status != target_local_status:
        transition_result = apply_local_payment_status(payment, target_local_status)
    elif payment.status == "confirmed":
        sync_payment_counters(payment)

    db.session.commit()

    return {
        "payment": payment,
        "remote_payment": resolved_remote_payment,
        "provider_status": provider_status,
        "local_status": payment.status,
        "transition_result": transition_result,
    }


def sync_payment_from_yookassa_notification(payload):
    if not isinstance(payload, dict):
        raise ValueError("Некорректное тело webhook")

    remote_payment = payload.get("object")
    if not isinstance(remote_payment, dict):
        raise ValueError("Webhook не содержит объект оплаты")

    payment = _find_payment_by_remote_object(remote_payment)
    if not payment:
        logger.warning("YooKassa webhook: локальная оплата не найдена для payload %s", remote_payment.get("id"))
        return None

    # Treat the webhook as a trigger and verify the real provider state
    # with a direct YooKassa API read before changing local payment data.
    return sync_local_payment_with_yookassa(payment)
