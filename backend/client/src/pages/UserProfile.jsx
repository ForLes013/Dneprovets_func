import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  User,
  Phone,
  Mail,
  Users,
  Calendar,
  Settings,
  LogOut,
  Edit,
  Save,
  X,
  Plus,
  Trash2,
  Clock,
  MapPin,
  CreditCard,
  CheckCircle,
  XCircle,
  Clock as ClockIcon,
  DollarSign,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  TrendingUp,
  Calendar as CalendarIcon,
  Filter,
  RefreshCw,
} from "lucide-react";
import ToastStack from "../components/ui/ToastStack.jsx";
import ConfirmDialog from "../components/ui/ConfirmDialog.jsx";

// Константы для переиспользования
const PAYMENT_PLANS = [
  {
    id: 1,
    name: "Базовый",
    trainings: 8,
    price: 4000,
    description: "2 тренировки в неделю",
  },
  {
    id: 2,
    name: "Стандартный",
    trainings: 12,
    price: 5500,
    description: "3 тренировки в неделю",
  },
  {
    id: 3,
    name: "Полный",
    trainings: 16,
    price: 7000,
    description: "4 тренировки в неделю",
  },
  {
    id: 4,
    name: "Индивидуальный",
    trainings: 4,
    price: 2500,
    description: "1 тренировка в неделю",
  },
];

const DEFAULT_PAYMENT_PLANS = [
  {
    id: "basic",
    name: "Базовый",
    trainings: 8,
    price: 4000,
    description: "2 тренировки в неделю",
  },
  {
    id: "standard",
    name: "Стандартный",
    trainings: 12,
    price: 5500,
    description: "3 тренировки в неделю",
  },
  {
    id: "full",
    name: "Полный",
    trainings: 16,
    price: 7000,
    description: "4 тренировки в неделю",
  },
  {
    id: "individual",
    name: "Индивидуальный",
    trainings: 4,
    price: 2500,
    description: "1 тренировка в неделю",
  },
];

const normalizePaymentPlan = (plan, fallbackId = null) => {
  const normalizedTrainings = Number.parseInt(plan?.trainings, 10);
  const normalizedPrice = Number.parseInt(plan?.price, 10);

  return {
    id: String(plan?.id || fallbackId || "plan"),
    name: typeof plan?.name === "string" ? plan.name : "",
    trainings:
      Number.isFinite(normalizedTrainings) && normalizedTrainings > 0
        ? normalizedTrainings
        : "",
    price:
      Number.isFinite(normalizedPrice) && normalizedPrice >= 0
        ? normalizedPrice
        : "",
    description: typeof plan?.description === "string" ? plan.description : "",
  };
};

const hasPaymentPlan = (plan) =>
  Boolean(
    plan?.name?.trim() &&
      Number.isFinite(Number.parseInt(plan?.trainings, 10)) &&
      Number.isFinite(Number.parseInt(plan?.price, 10)),
  );

const normalizePaymentPlans = (plans) => {
  if (!Array.isArray(plans) || plans.length === 0) {
    return DEFAULT_PAYMENT_PLANS.map((plan) =>
      normalizePaymentPlan(plan, plan.id),
    );
  }

  const normalizedPlans = plans
    .map((plan, index) =>
      normalizePaymentPlan(plan, `payment-plan-${index + 1}`),
    )
    .filter(hasPaymentPlan);

  return normalizedPlans.length > 0
    ? normalizedPlans
    : DEFAULT_PAYMENT_PLANS.map((plan) =>
        normalizePaymentPlan(plan, plan.id),
      );
};

void PAYMENT_PLANS;

const STATUS_CONFIG = {
  confirmed: {
    text: "Подтверждена",
    class: "confirmed",
    icon: CheckCircle,
    color: "#22c55e",
  },
  pending: {
    text: "Ожидает оплаты",
    class: "pending",
    icon: Clock,
    color: "#eab308",
  },
  rejected: {
    text: "Отклонена",
    class: "rejected",
    icon: XCircle,
    color: "#ef4444",
  },
  attended: {
    text: "Посещено",
    class: "attended",
    icon: CheckCircle,
    color: "#22c55e",
  },
  missed: {
    text: "Пропущено",
    class: "missed",
    icon: XCircle,
    color: "#ef4444",
  },
  scheduled: {
    text: "Запланировано",
    class: "scheduled",
    icon: ClockIcon,
    color: "#eab308",
  },
  rescheduled: {
    text: "Перенесено",
    class: "rescheduled",
    icon: RefreshCw,
    color: "#3b82f6",
  },
  expired: {
    text: "Посещено (автоматически)",
    class: "expired",
    icon: CheckCircle,
    color: "#10b981",
  },
};

// Вспомогательные функции
const calculateAgeFromBirthYear = (birthYear) => {
  if (!birthYear) return null;
  const currentYear = new Date().getFullYear();
  return currentYear - parseInt(birthYear);
};

const isValidBirthYear = (birthYear) => {
  const year = parseInt(birthYear);
  const currentYear = new Date().getFullYear();
  return !isNaN(year) && year >= 2000 && year <= currentYear;
};

// Вспомогательные компоненты
const StatusBadge = ({ status, children }) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = config.icon;
  return (
    <div className={`status-badge ${config.class}`}>
      <Icon size={16} color={config.color} />
      <span>{children || config.text}</span>
    </div>
  );
};

const LoadingSpinner = () => (
  <div className="loading-container">
    <div className="loading-spinner"></div>
    <p>Загрузка...</p>
  </div>
);

const ErrorMessage = ({ message, onRetry }) => (
  <div className="error-container">
    <AlertCircle size={48} />
    <h2>Ошибка загрузки</h2>
    <p>{message}</p>
    {onRetry && (
      <button className="auth-btn" onClick={onRetry}>
        Попробовать снова
      </button>
    )}
    <button className="auth-btn" onClick={() => (window.location.href = "/")}>
      На главную
    </button>
  </div>
);

// Компонент для выбора филиала
const BranchSelectionModal = ({
  child,
  branches,
  onSelect,
  onCancel,
  loading,
}) => {
  const [selectedBranch, setSelectedBranch] = useState(null);

  const handleSelect = useCallback(() => {
    if (selectedBranch) {
      onSelect(selectedBranch);
    }
  }, [selectedBranch, onSelect]);

  if (!branches || branches.length === 0) {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <div className="modal-header">
            <h3>Выбор филиала</h3>
            <button className="close-btn" onClick={onCancel}>
              ×
            </button>
          </div>
          <div className="modal-content">
            <div className="no-branches">
              <AlertCircle size={48} />
              <h4>Нет доступных филиалов</h4>
              <p>
                Для {child.birth_year} года рождения нет доступных филиалов с
                расписанием.
              </p>
              <p>Пожалуйста, свяжитесь с администрацией.</p>
              <button className="cancel-btn" onClick={onCancel}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal branch-modal">
        <div className="modal-header">
          <h3>Выбор филиала для {child.name}</h3>
          <button className="close-btn" onClick={onCancel}>
            ×
          </button>
        </div>
        <div className="modal-content">
          <div className="branch-selection-info">
            <p>
              <strong>Год рождения:</strong> {child.birth_year}
            </p>
            <p>
              <strong>Возрастная группа:</strong>{" "}
              {branches[0]?.schedules?.[0]?.age_group ||
                branches[0]?.age_group ||
                "Не определена"}
            </p>
          </div>

          <div className="branches-list">
            {branches.map((branch) => {
              const branchSchedules = branch.schedules || branch.schedule || [];

              return (
                <div
                  key={branch.id}
                  className={`branch-card ${
                    selectedBranch?.id === branch.id ? "selected" : ""
                  }`}
                  onClick={() => setSelectedBranch(branch)}
                >
                  <div className="branch-header">
                    <h4>{branch.name}</h4>
                    <span className="schedule-count">
                      {branchSchedules.length} тренировок в неделю
                    </span>
                  </div>

                  <div className="branch-details">
                    <p>
                      <MapPin size={14} /> {branch.address}
                    </p>
                    {branch.phone && (
                      <p>
                        <Phone size={14} /> {branch.phone}
                      </p>
                    )}
                  </div>

                  <div className="branch-schedule">
                    <strong>Расписание:</strong>
                    <ul>
                      {branchSchedules.map((item, idx) => (
                        <li key={idx}>
                          {item.days_display || item.day} {item.time}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="modal-actions">
            <button className="cancel-btn" onClick={onCancel}>
              Отмена
            </button>
            <button
              className="confirm-btn"
              onClick={handleSelect}
              disabled={!selectedBranch || loading}
            >
              {loading ? "Сохранение..." : "Выбрать филиал"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ApplicationRequestModal = ({
  user,
  initialChildId,
  fetchWithAuth,
  onCreated,
  onCancel,
  onEditProfile,
  onEditChildren,
  showNotification,
}) => {
  const children = useMemo(() => user?.children || [], [user?.children]);
  const childrenWithMeta = useMemo(
    () =>
      children.map((child) => {
        const birthYearValid =
          Boolean(child.birth_year) && isValidBirthYear(child.birth_year);

        return {
          ...child,
          birthYearValid,
          age: birthYearValid ? calculateAgeFromBirthYear(child.birth_year) : null,
        };
      }),
    [children],
  );
  const validChildren = useMemo(
    () => childrenWithMeta.filter((child) => child.birthYearValid),
    [childrenWithMeta],
  );
  const invalidChildrenCount = childrenWithMeta.length - validChildren.length;
  const [selectedChildId, setSelectedChildId] = useState(() => {
    const matchedChild = validChildren.find(
      (child) => String(child.id) === String(initialChildId),
    );
    return matchedChild
      ? String(matchedChild.id)
      : String(validChildren[0]?.id || "");
  });
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedScheduleId, setSelectedScheduleId] = useState("");
  const [message, setMessage] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [currentStep, setCurrentStep] = useState(1);
  const modalScrollRef = useRef(null);

  const selectedChild = useMemo(
    () =>
      childrenWithMeta.find(
        (child) => String(child.id) === String(selectedChildId),
      ) || null,
    [childrenWithMeta, selectedChildId],
  );

  const selectedChildBranchName =
    selectedChild?.branch_name || "Филиал пока не выбран";
  const hasContactInfo = Boolean(user?.phone?.trim() || user?.email?.trim());
  const canContinueStep1 = Boolean(selectedChild?.birthYearValid && hasContactInfo);

  useEffect(() => {
    if (validChildren.length === 0) {
      setSelectedChildId("");
      return;
    }

    if (
      !selectedChildId ||
      !validChildren.some(
        (child) => String(child.id) === String(selectedChildId),
      )
    ) {
      setSelectedChildId(String(validChildren[0].id));
    }
  }, [selectedChildId, validChildren]);

  useEffect(() => {
    if (currentStep > 1 && !canContinueStep1) {
      setCurrentStep(1);
    }
  }, [canContinueStep1, currentStep]);

  useEffect(() => {
    if (modalScrollRef.current) {
      modalScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentStep]);

  const selectedBranch = useMemo(
    () =>
      branches.find((branch) => String(branch.id) === String(selectedBranchId)) ||
      null,
    [branches, selectedBranchId],
  );

  const selectedSchedules = useMemo(
    () => selectedBranch?.schedules || [],
    [selectedBranch],
  );

  const selectedSchedule = useMemo(
    () =>
      selectedSchedules.find(
        (schedule) => String(schedule.id) === String(selectedScheduleId),
      ) || null,
    [selectedSchedules, selectedScheduleId],
  );

  const canContinueStep2 = Boolean(selectedBranch && selectedSchedule);
  const progress = `${Math.round((currentStep / 3) * 100)}%`;

  useEffect(() => {
    const loadBranchesForChild = async () => {
      if (!selectedChild) {
        setBranches([]);
        setSelectedBranchId("");
        setSelectedScheduleId("");
        return;
      }

      if (!selectedChild.birth_year || !isValidBirthYear(selectedChild.birth_year)) {
        setBranches([]);
        setSelectedBranchId("");
        setSelectedScheduleId("");
        setFormError(
          "Для подачи заявки сначала укажите корректный год рождения ребёнка.",
        );
        return;
      }

      setLoadingOptions(true);
      setFormError("");

      try {
        const result = await fetchWithAuth(
          `/api/branches/by-birth-year?birth_year=${encodeURIComponent(
            selectedChild.birth_year,
          )}`,
        );
        const nextBranches = Array.isArray(result.branches) ? result.branches : [];
        const preferredBranch =
          nextBranches.find(
            (branch) =>
              selectedChild.branch_id &&
              String(branch.id) === String(selectedChild.branch_id),
          ) || nextBranches[0];

        setBranches(nextBranches);
        setSelectedBranchId(preferredBranch ? String(preferredBranch.id) : "");
      } catch (error) {
        console.error("Ошибка загрузки филиалов для заявки:", error);
        setBranches([]);
        setSelectedBranchId("");
        setSelectedScheduleId("");
        setFormError(error.message || "Не удалось загрузить филиалы");
      } finally {
        setLoadingOptions(false);
      }
    };

    loadBranchesForChild();
  }, [fetchWithAuth, selectedChild]);

  useEffect(() => {
    if (selectedSchedules.length === 0) {
      setSelectedScheduleId("");
      return;
    }

    if (
      !selectedScheduleId ||
      !selectedSchedules.some(
        (schedule) => String(schedule.id) === String(selectedScheduleId),
      )
    ) {
      setSelectedScheduleId(String(selectedSchedules[0].id));
    }
  }, [selectedScheduleId, selectedSchedules]);

  useEffect(() => {
    setFormError("");
  }, [selectedChildId, selectedBranchId, selectedScheduleId]);

  const handleContinue = useCallback(() => {
    if (currentStep === 1) {
      if (!selectedChild) {
        setFormError("Сначала выберите ребёнка.");
        return;
      }

      if (!selectedChild.birthYearValid) {
        setFormError(
          "Для подачи заявки нужен корректный год рождения выбранного ребёнка.",
        );
        return;
      }

      if (!hasContactInfo) {
        setFormError(
          "Для подачи заявки укажите телефон или email в разделе профиля.",
        );
        return;
      }

      setFormError("");
      setCurrentStep(2);
      return;
    }

    if (currentStep === 2) {
      if (!selectedBranch) {
        setFormError("Выберите филиал для заявки.");
        return;
      }

      if (!selectedSchedule) {
        setFormError("Выберите подходящее расписание.");
        return;
      }

      setFormError("");
      setCurrentStep(3);
    }
  }, [
    currentStep,
    hasContactInfo,
    selectedBranch,
    selectedChild,
    selectedSchedule,
  ]);

  const handleBack = useCallback(() => {
    setFormError("");
    setCurrentStep((prev) => Math.max(1, prev - 1));
  }, []);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();

      if (!selectedChild) {
        setFormError("Сначала выберите ребёнка.");
        return;
      }

      if (!hasContactInfo) {
        setFormError(
          "Для подачи заявки укажите телефон или email в разделе профиля.",
        );
        return;
      }

      if (!selectedBranch) {
        setFormError("Выберите филиал для заявки.");
        return;
      }

      if (!selectedSchedule) {
        setFormError("Выберите подходящее расписание.");
        return;
      }

      setSubmitting(true);
      setFormError("");

      try {
        const result = await fetchWithAuth("/api/my-applications", {
          method: "POST",
          body: JSON.stringify({
            child_id: selectedChild.id,
            branch_id: selectedBranch.id,
            schedule_id: selectedSchedule.id,
            message: message.trim(),
          }),
        });

        if (!result.success || !result.application) {
          throw new Error(result.error || "Не удалось создать заявку.");
        }

        onCreated(result.application);
      } catch (error) {
        console.error("Ошибка создания заявки:", error);
        const errorMessage = error.message || "Не удалось создать заявку.";
        setFormError(errorMessage);
        showNotification(errorMessage, "error");
      } finally {
        setSubmitting(false);
      }
    },
    [
      fetchWithAuth,
      hasContactInfo,
      message,
      onCreated,
      selectedBranch,
      selectedChild,
      selectedSchedule,
      showNotification,
    ],
  );

  const summaryRows = useMemo(
    () => [
      {
        label: "Ребёнок",
        value: selectedChild
          ? `${selectedChild.name} • ${selectedChild.birth_year} г.р.`
          : "Не выбран",
      },
      {
        label: "Контакты",
        value: hasContactInfo
          ? user?.phone || user?.email
          : "Нужно заполнить профиль",
      },
      {
        label: "Текущий филиал",
        value: selectedChildBranchName,
      },
      {
        label: "Новый филиал",
        value: selectedBranch?.name || "Не выбран",
      },
      {
        label: "Расписание",
        value: selectedSchedule
          ? `${selectedSchedule.days_display || "Дни"} • ${
              selectedSchedule.time || "Время уточняется"
            }`
          : "Не выбрано",
      },
      {
        label: "Тренер",
        value: selectedSchedule?.instructor || "Назначается",
      },
    ],
    [
      hasContactInfo,
      selectedBranch,
      selectedChild,
      selectedChildBranchName,
      selectedSchedule,
      user?.email,
      user?.phone,
    ],
  );

  return (
    <div className="modal-overlay application-modal-overlay" onClick={onCancel}>
      <div
        className="modal application-request-modal application-flow-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="application-flow-header">
          <div className="application-flow-header-top">
            <div className="application-flow-heading">
              <span className="application-flow-kicker">Новая заявка</span>
              <h3>Запись на тренировку</h3>
              <p>Выберите ребёнка, филиал и подходящее время без лишних шагов.</p>
            </div>
            <button className="close-btn" onClick={onCancel}>
              Г—
            </button>
          </div>

          <div className="application-flow-progress">
            <div className="application-flow-progress-meta">
              <strong>
                {currentStep === 1 && "Ребёнок"}
                {currentStep === 2 && "Филиал и расписание"}
                {currentStep === 3 && "Проверка"}
              </strong>
              <span>Шаг {currentStep} из 3</span>
            </div>
            <div className="application-flow-progress-bar">
              <span style={{ width: progress }} />
            </div>
          </div>
        </div>

        <form className="application-request-form application-flow-form" onSubmit={handleSubmit}>
          <div className="application-flow-scroll" ref={modalScrollRef}>
            {formError && (
              <div className="application-empty-state warning">
                <AlertCircle size={20} />
                <p>{formError}</p>
              </div>
            )}

            {currentStep > 1 && selectedChild && (
              <div className="application-flow-context">
                <span className="application-flow-chip">
                  <Users size={14} />
                  {selectedChild.name}
                </span>
                <span className="application-flow-chip">
                  <Calendar size={14} />
                  {selectedChild.birth_year} г.р.
                </span>
                {selectedBranch && (
                  <span className="application-flow-chip">
                    <MapPin size={14} />
                    {selectedBranch.name}
                  </span>
                )}
                {selectedSchedule && (
                  <span className="application-flow-chip">
                    <Clock size={14} />
                    {selectedSchedule.time || "Время уточняется"}
                  </span>
                )}
              </div>
            )}

            {currentStep === 1 && (
              <div className="application-flow-screen">
                <div className="application-flow-copy">
                  <h4>Кого записываем?</h4>
                  <p>Покажем только те варианты, которые подходят по возрасту ребёнка.</p>
                </div>

                <div className="application-flow-list">
                  {childrenWithMeta.map((child) => {
                    const isSelected =
                      String(child.id) === String(selectedChildId);

                    return (
                      <button
                        key={child.id}
                        type="button"
                        className={`application-flow-option ${
                          isSelected ? "selected" : ""
                        } ${!child.birthYearValid ? "disabled" : ""}`}
                        onClick={() =>
                          child.birthYearValid &&
                          setSelectedChildId(String(child.id))
                        }
                        disabled={!child.birthYearValid}
                      >
                        <div className="application-flow-option-main">
                          <div className="application-flow-option-title">
                            <strong>{child.name || "Без имени"}</strong>
                            <span>
                              {child.birthYearValid
                                ? `${child.age} лет`
                                : "Нужен год рождения"}
                            </span>
                          </div>
                          <div className="application-flow-option-meta">
                            <span>
                              <Calendar size={14} />
                              {child.birth_year
                                ? `${child.birth_year} г.р.`
                                : "Год рождения не указан"}
                            </span>
                            <span>
                              <MapPin size={14} />
                              {child.branch_name || "Филиал пока не выбран"}
                            </span>
                          </div>
                        </div>
                        {isSelected && child.birthYearValid && (
                          <CheckCircle size={18} />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="application-flow-stack">
                  <div className="application-flow-card">
                    <div className="application-flow-card-head">
                      <strong>Контакты родителя</strong>
                      <span
                        className={`application-flow-state ${
                          hasContactInfo ? "ready" : "warning"
                        }`}
                      >
                        {hasContactInfo ? "Готово" : "Нужно заполнить"}
                      </span>
                    </div>
                    <div className="application-flow-card-body">
                      <span>{user?.phone || "Телефон не указан"}</span>
                      <span>{user?.email || "Email не указан"}</span>
                    </div>
                  </div>

                  {!hasContactInfo && (
                    <div className="application-note warning">
                      <div>
                        <strong>Без контактов заявку подтвердить не получится</strong>
                        <p>Добавьте телефон или email, а затем вернитесь к записи.</p>
                      </div>
                      {onEditProfile && (
                        <button
                          type="button"
                          className="application-inline-btn"
                          onClick={onEditProfile}
                        >
                          Открыть профиль
                        </button>
                      )}
                    </div>
                  )}

                  {invalidChildrenCount > 0 && (
                    <div className="application-note muted">
                      <div>
                        <strong>Не все дети готовы к записи</strong>
                        <p>
                          Для {invalidChildrenCount}{" "}
                          {invalidChildrenCount === 1 ? "ребёнка" : "детей"}{" "}
                          нужно проверить год рождения.
                        </p>
                      </div>
                      {onEditChildren && (
                        <button
                          type="button"
                          className="application-inline-btn"
                          onClick={onEditChildren}
                        >
                          Проверить детей
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="application-flow-screen">
                <div className="application-flow-copy">
                  <h4>Куда и когда ходить?</h4>
                  <p>Сначала выберите филиал, затем удобную группу и время.</p>
                </div>

                <div className="application-flow-block">
                  <div className="application-flow-block-head">
                    <span>1</span>
                    <div>
                      <strong>Филиал</strong>
                      <p>{branches.length > 0 ? `${branches.length} вариантов` : "Подходящие филиалы"}</p>
                    </div>
                  </div>

                  {loadingOptions ? (
                    <div className="application-empty-state">
                      <Clock size={22} />
                      <p>Подбираем филиалы и группы для выбранного ребёнка...</p>
                    </div>
                  ) : branches.length === 0 ? (
                    <div className="application-empty-state">
                      <MapPin size={22} />
                      <p>Для выбранного возраста пока нет доступных филиалов с расписанием.</p>
                    </div>
                  ) : (
                    <div className="application-flow-list">
                      {branches.map((branch) => {
                        const schedules = branch.schedules || [];
                        const isSelected =
                          String(branch.id) === String(selectedBranchId);

                        return (
                          <button
                            key={branch.id}
                            type="button"
                            className={`application-flow-option ${
                              isSelected ? "selected" : ""
                            }`}
                            onClick={() => setSelectedBranchId(String(branch.id))}
                          >
                            <div className="application-flow-option-main">
                              <div className="application-flow-option-title">
                                <strong>{branch.name}</strong>
                                <span>{schedules.length} групп</span>
                              </div>
                              <div className="application-flow-option-meta">
                                <span>
                                  <MapPin size={14} />
                                  {branch.address}
                                </span>
                                {branch.phone && (
                                  <span>
                                    <Phone size={14} />
                                    {branch.phone}
                                  </span>
                                )}
                              </div>
                            </div>
                            {isSelected && <CheckCircle size={18} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="application-flow-block">
                  <div className="application-flow-block-head">
                    <span>2</span>
                    <div>
                      <strong>Группа и время</strong>
                      <p>
                        {selectedSchedules.length > 0
                          ? `${selectedSchedules.length} вариантов`
                          : "Сначала выберите филиал"}
                      </p>
                    </div>
                  </div>

                  {selectedSchedules.length > 0 ? (
                    <div className="application-flow-list">
                      {selectedSchedules.map((schedule) => {
                        const isSelected =
                          String(schedule.id) === String(selectedScheduleId);

                        return (
                          <button
                            key={schedule.id}
                            type="button"
                            className={`application-flow-option ${
                              isSelected ? "selected" : ""
                            }`}
                            onClick={() =>
                              setSelectedScheduleId(String(schedule.id))
                            }
                          >
                            <div className="application-flow-option-main">
                              <div className="application-flow-option-title">
                                <strong>{schedule.age_group || "Группа"}</strong>
                                <span>{schedule.time || "Время уточняется"}</span>
                              </div>
                              <div className="application-flow-option-meta">
                                <span>
                                  <CalendarIcon size={14} />
                                  {schedule.days_display || "Дни уточняются"}
                                </span>
                                <span>
                                  <Users size={14} />
                                  {schedule.instructor || "Тренер назначается"}
                                </span>
                              </div>
                            </div>
                            {isSelected && <CheckCircle size={18} />}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="application-empty-state">
                      <CalendarIcon size={22} />
                      <p>После выбора филиала здесь появятся подходящие группы и время.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="application-flow-screen">
                <div className="application-flow-copy">
                  <h4>Проверьте заявку</h4>
                  <p>Если нужно, добавьте короткий комментарий для администратора.</p>
                </div>

                <div className="application-flow-review">
                  {summaryRows.map((item) => (
                    <div key={item.label} className="application-flow-review-row">
                      <strong>{item.label}</strong>
                      <span>{item.value}</span>
                    </div>
                  ))}
                </div>

                <div className="application-flow-card">
                  <div className="application-flow-card-head">
                    <strong>Комментарий</strong>
                    <span className="application-flow-state neutral">Необязательно</span>
                  </div>
                  <div className="info-item application-comment-field">
                    <textarea
                      className="application-message-input"
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      rows={5}
                      placeholder="Например: удобно после 18:00, рассмотрим два филиала, нужен звонок перед первой тренировкой"
                    />
                  </div>
                </div>

                <div className="application-note muted">
                  <div>
                    <strong>Что будет дальше</strong>
                    <p>Заявка сразу появится в админке. Администратор увидит ребёнка, филиал, группу и ваши контакты.</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="modal-actions application-flow-actions">
            <div className="application-flow-actions-copy">
              {currentStep === 1 && "Сначала выберите ребёнка и проверьте контакты."}
              {currentStep === 2 &&
                (loadingOptions
                  ? "Подбираем филиалы и группы..."
                  : "Выберите филиал и одно расписание.")}
              {currentStep === 3 &&
                "После отправки заявка сразу попадёт в админ-панель."}
            </div>

            <div className="application-flow-actions-buttons">
              <button
                type="button"
                className="cancel-btn"
                onClick={currentStep === 1 ? onCancel : handleBack}
              >
                {currentStep === 1 ? "Закрыть" : "Назад"}
              </button>

              {currentStep < 3 ? (
                <button
                  type="button"
                  className="confirm-btn"
                  onClick={handleContinue}
                  disabled={
                    currentStep === 1
                      ? !selectedChild || !selectedChild.birthYearValid || !hasContactInfo
                      : loadingOptions || !selectedBranch || !selectedSchedule
                  }
                >
                  {currentStep === 1 ? "Дальше" : "Проверить заявку"}
                </button>
              ) : (
                <button
                  type="submit"
                  className="confirm-btn"
                  disabled={submitting || !canContinueStep1 || !canContinueStep2}
                >
                  {submitting ? "Отправляем..." : "Отправить заявку"}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

const LegacyApplicationRequestModal = ({
  user,
  initialChildId,
  fetchWithAuth,
  onCreated,
  onCancel,
  onEditProfile,
  onEditChildren,
  showNotification,
}) => {
  const children = useMemo(() => user?.children || [], [user?.children]);
  const childrenWithMeta = useMemo(
    () =>
      children.map((child) => {
        const birthYearValid =
          Boolean(child.birth_year) && isValidBirthYear(child.birth_year);

        return {
          ...child,
          birthYearValid,
          age: birthYearValid ? calculateAgeFromBirthYear(child.birth_year) : null,
        };
      }),
    [children],
  );
  const validChildren = useMemo(
    () => childrenWithMeta.filter((child) => child.birthYearValid),
    [childrenWithMeta],
  );
  const invalidChildrenCount = childrenWithMeta.length - validChildren.length;
  const [selectedChildId, setSelectedChildId] = useState(() => {
    const matchedChild = validChildren.find(
      (child) => String(child.id) === String(initialChildId),
    );
    return matchedChild
      ? String(matchedChild.id)
      : String(validChildren[0]?.id || "");
  });
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedScheduleId, setSelectedScheduleId] = useState("");
  const [message, setMessage] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [currentStep, setCurrentStep] = useState(1);

  const selectedChild = useMemo(
    () =>
      childrenWithMeta.find(
        (child) => String(child.id) === String(selectedChildId),
      ) || null,
    [childrenWithMeta, selectedChildId],
  );

  const selectedChildBranchName = selectedChild?.branch_name || "Филиал пока не выбран";
  const hasContactInfo = Boolean(user?.phone?.trim() || user?.email?.trim());
  const canContinueStep1 = Boolean(selectedChild?.birthYearValid && hasContactInfo);

  const steps = useMemo(
    () => [
      {
        id: 1,
        label: "Ребёнок",
        hint: "Кого записываем",
        title: "Выберите ребёнка",
        description:
          "Покажем только те филиалы и группы, которые подходят по возрасту.",
      },
      {
        id: 2,
        label: "Филиал",
        hint: "Где и когда",
        title: "Подберите филиал и расписание",
        description:
          "Сначала выберите филиал, затем подходящее расписание для выбранного возраста.",
      },
      {
        id: 3,
        label: "Отправка",
        hint: "Проверка заявки",
        title: "Проверьте заявку перед отправкой",
        description:
          "Добавьте комментарий, если есть пожелания по времени, филиалу или группе.",
      },
    ],
    [],
  );

  useEffect(() => {
    if (validChildren.length === 0) {
      setSelectedChildId("");
      return;
    }

    if (
      !selectedChildId ||
      !validChildren.some(
        (child) => String(child.id) === String(selectedChildId),
      )
    ) {
      setSelectedChildId(String(validChildren[0].id));
    }
  }, [selectedChildId, validChildren]);

  useEffect(() => {
    if (currentStep > 1 && !canContinueStep1) {
      setCurrentStep(1);
    }
  }, [canContinueStep1, currentStep]);

  const selectedBranch = useMemo(
    () =>
      branches.find((branch) => String(branch.id) === String(selectedBranchId)) ||
      null,
    [branches, selectedBranchId],
  );

  const selectedSchedules = useMemo(
    () => selectedBranch?.schedules || [],
    [selectedBranch],
  );

  const selectedSchedule = useMemo(
    () =>
      selectedSchedules.find(
        (schedule) => String(schedule.id) === String(selectedScheduleId),
      ) || null,
    [selectedSchedules, selectedScheduleId],
  );

  const canContinueStep2 = Boolean(selectedBranch && selectedSchedule);
  const currentStepMeta = steps.find((step) => step.id === currentStep) || steps[0];

  useEffect(() => {
    const loadBranchesForChild = async () => {
      if (!selectedChild) {
        setBranches([]);
        setSelectedBranchId("");
        setSelectedScheduleId("");
        return;
      }

      if (!selectedChild.birth_year || !isValidBirthYear(selectedChild.birth_year)) {
        setBranches([]);
        setSelectedBranchId("");
        setSelectedScheduleId("");
        setFormError(
          "Для подачи заявки сначала укажите корректный год рождения ребёнка.",
        );
        return;
      }

      setLoadingOptions(true);
      setFormError("");

      try {
        const result = await fetchWithAuth(
          `/api/branches/by-birth-year?birth_year=${encodeURIComponent(
            selectedChild.birth_year,
          )}`,
        );
        const nextBranches = Array.isArray(result.branches) ? result.branches : [];
        const preferredBranch =
          nextBranches.find(
            (branch) =>
              selectedChild.branch_id &&
              String(branch.id) === String(selectedChild.branch_id),
          ) || nextBranches[0];

        setBranches(nextBranches);
        setSelectedBranchId(preferredBranch ? String(preferredBranch.id) : "");
      } catch (error) {
        console.error("Ошибка загрузки филиалов для заявки:", error);
        setBranches([]);
        setSelectedBranchId("");
        setSelectedScheduleId("");
        setFormError(error.message || "Не удалось загрузить филиалы");
      } finally {
        setLoadingOptions(false);
      }
    };

    loadBranchesForChild();
  }, [fetchWithAuth, selectedChild]);

  useEffect(() => {
    if (selectedSchedules.length === 0) {
      setSelectedScheduleId("");
      return;
    }

    if (
      !selectedScheduleId ||
      !selectedSchedules.some(
        (schedule) => String(schedule.id) === String(selectedScheduleId),
      )
    ) {
      setSelectedScheduleId(String(selectedSchedules[0].id));
    }
  }, [selectedScheduleId, selectedSchedules]);

  const handleGoToStep = useCallback(
    (nextStep) => {
      if (nextStep === currentStep) {
        return;
      }

      if (nextStep < currentStep) {
        setFormError("");
        setCurrentStep(nextStep);
        return;
      }

      if (nextStep === 2 && canContinueStep1) {
        setFormError("");
        setCurrentStep(2);
        return;
      }

      if (nextStep === 3 && canContinueStep1 && canContinueStep2) {
        setFormError("");
        setCurrentStep(3);
      }
    },
    [canContinueStep1, canContinueStep2, currentStep],
  );

  const handleContinue = useCallback(() => {
    if (currentStep === 1) {
      if (!selectedChild) {
        setFormError("Сначала выберите ребёнка.");
        return;
      }

      if (!selectedChild.birthYearValid) {
        setFormError(
          "Для подачи заявки нужен корректный год рождения выбранного ребёнка.",
        );
        return;
      }

      if (!hasContactInfo) {
        setFormError(
          "Для подачи заявки укажите телефон или email в разделе профиля.",
        );
        return;
      }

      setFormError("");
      setCurrentStep(2);
      return;
    }

    if (currentStep === 2) {
      if (!selectedBranch) {
        setFormError("Выберите филиал для заявки.");
        return;
      }

      if (!selectedSchedule) {
        setFormError("Выберите подходящее расписание.");
        return;
      }

      setFormError("");
      setCurrentStep(3);
    }
  }, [
    currentStep,
    hasContactInfo,
    selectedBranch,
    selectedChild,
    selectedSchedule,
  ]);

  const handleBack = useCallback(() => {
    setFormError("");
    setCurrentStep((prev) => Math.max(1, prev - 1));
  }, []);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();

      if (!selectedChild) {
        setFormError("Сначала выберите ребёнка.");
        return;
      }

      if (!hasContactInfo) {
        setFormError(
          "Для подачи заявки укажите телефон или email в разделе профиля.",
        );
        return;
      }

      if (!selectedBranch) {
        setFormError("Выберите филиал для заявки.");
        return;
      }

      if (!selectedSchedule) {
        setFormError("Выберите подходящее расписание.");
        return;
      }

      setSubmitting(true);
      setFormError("");

      try {
        const result = await fetchWithAuth("/api/my-applications", {
          method: "POST",
          body: JSON.stringify({
            child_id: selectedChild.id,
            branch_id: selectedBranch.id,
            schedule_id: selectedSchedule.id,
            message: message.trim(),
          }),
        });

        if (!result.success || !result.application) {
          throw new Error(result.error || "Не удалось создать заявку.");
        }

        onCreated(result.application);
      } catch (error) {
        console.error("Ошибка создания заявки:", error);
        const errorMessage = error.message || "Не удалось создать заявку.";
        setFormError(errorMessage);
        showNotification(errorMessage, "error");
      } finally {
        setSubmitting(false);
      }
    },
    [
      fetchWithAuth,
      hasContactInfo,
      message,
      onCreated,
      selectedBranch,
      selectedChild,
      selectedSchedule,
      showNotification,
    ],
  );

  return (
    <div className="modal-overlay application-modal-overlay" onClick={onCancel}>
      <div
        className="modal application-request-modal application-wizard-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header application-wizard-header">
          <div className="application-wizard-header-copy">
            <h3>Новая заявка на тренировку</h3>
            <p>Оформим заявку за пару шагов, без переходов на другие страницы.</p>
          </div>
          <button className="close-btn" onClick={onCancel}>
            ×
          </button>
        </div>

        <div className="application-stepper">
          {steps.map((step) => {
            const isActive = currentStep === step.id;
            const isComplete = currentStep > step.id;
            const isClickable =
              step.id === 1 ||
              (step.id === 2 && canContinueStep1) ||
              (step.id === 3 && canContinueStep1 && canContinueStep2);

            return (
              <button
                key={step.id}
                type="button"
                className={`application-step ${
                  isActive ? "active" : ""
                } ${isComplete ? "complete" : ""}`}
                onClick={() => handleGoToStep(step.id)}
                disabled={!isClickable && !isActive}
              >
                <span className="application-step-index">
                  {isComplete ? <CheckCircle size={14} /> : step.id}
                </span>
                <span className="application-step-copy">
                  <strong>{step.label}</strong>
                  <small>{step.hint}</small>
                </span>
              </button>
            );
          })}
        </div>

        <form className="application-request-form" onSubmit={handleSubmit}>
          <div className="application-wizard-scroll">
            <div className="application-wizard-content">
              <div className="application-wizard-main">
                <div className="application-wizard-intro">
                  <span className="application-wizard-kicker">
                    Шаг {currentStep} из {steps.length}
                  </span>
                  <h4>{currentStepMeta.title}</h4>
                  <p>{currentStepMeta.description}</p>
                </div>

                {formError && (
                  <div className="application-empty-state warning">
                    <AlertCircle size={20} />
                    <p>{formError}</p>
                  </div>
                )}

                {currentStep === 1 && (
                  <>
                    <div className="application-panel">
                      <div className="application-panel-header">
                        <div>
                          <h5>Кого записываем</h5>
                          <p>Выберите ребёнка из личного кабинета</p>
                        </div>
                        <span>{childrenWithMeta.length} в профиле</span>
                      </div>

                      <div className="application-child-grid">
                        {childrenWithMeta.map((child) => {
                          const isSelected =
                            String(child.id) === String(selectedChildId);

                          return (
                            <button
                              key={child.id}
                              type="button"
                              className={`application-child-card ${
                                isSelected ? "selected" : ""
                              } ${!child.birthYearValid ? "disabled" : ""}`}
                              onClick={() =>
                                child.birthYearValid &&
                                setSelectedChildId(String(child.id))
                              }
                              disabled={!child.birthYearValid}
                            >
                              <div className="application-child-top">
                                <strong>{child.name || "Без имени"}</strong>
                                <span>
                                  {child.birthYearValid
                                    ? `${child.age} лет`
                                    : "Нужен год рождения"}
                                </span>
                              </div>

                              <div className="application-child-meta">
                                <span>
                                  <Calendar size={14} />
                                  {child.birth_year
                                    ? `${child.birth_year} г.р.`
                                    : "Год рождения не указан"}
                                </span>
                                <span>
                                  <MapPin size={14} />
                                  {child.branch_name || "Филиал ещё не выбран"}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="application-request-grid application-request-grid-compact">
                      <div className="application-contact-card application-panel">
                        <div className="application-panel-header">
                          <div>
                            <h5>Контакты для связи</h5>
                            <p>Администратор использует их для обратной связи</p>
                          </div>
                        </div>
                        <span>{user?.phone || "Телефон не указан"}</span>
                        <span>{user?.email || "Email не указан"}</span>
                      </div>

                      {!hasContactInfo ? (
                        <div className="application-note warning">
                          <div>
                            <strong>Нужны контакты родителя</strong>
                            <p>
                              Добавьте телефон или email в профиле, иначе мы не
                              сможем подтвердить заявку.
                            </p>
                          </div>
                          {onEditProfile && (
                            <button
                              type="button"
                              className="application-inline-btn"
                              onClick={onEditProfile}
                            >
                              Заполнить профиль
                            </button>
                          )}
                        </div>
                      ) : invalidChildrenCount > 0 ? (
                        <div className="application-note muted">
                          <div>
                            <strong>Не все дети готовы к подаче заявки</strong>
                            <p>
                              Для {invalidChildrenCount}{" "}
                              {invalidChildrenCount === 1 ? "ребёнка" : "детей"}{" "}
                              нужен корректный год рождения.
                            </p>
                          </div>
                          {onEditChildren && (
                            <button
                              type="button"
                              className="application-inline-btn"
                              onClick={onEditChildren}
                            >
                              Проверить детей
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </>
                )}

                {currentStep === 2 && (
                  <div className="application-branch-columns">
                    <div className="application-panel">
                      <div className="application-panel-header">
                        <div>
                          <h5>Филиалы</h5>
                          <p>Выберите удобную площадку</p>
                        </div>
                        <span>{branches.length} вариантов</span>
                      </div>

                      {loadingOptions ? (
                        <div className="application-empty-state">
                          <Clock size={22} />
                          <p>Подбираем филиалы и расписание для выбранного ребёнка...</p>
                        </div>
                      ) : branches.length === 0 ? (
                        <div className="application-empty-state">
                          <MapPin size={22} />
                          <p>
                            Для выбранного возраста пока нет доступных филиалов с
                            расписанием.
                          </p>
                        </div>
                      ) : (
                        <div className="application-branch-list">
                          {branches.map((branch) => {
                            const schedules = branch.schedules || [];
                            const isSelected =
                              String(branch.id) === String(selectedBranchId);

                            return (
                              <button
                                key={branch.id}
                                type="button"
                                className={`application-branch-card ${
                                  isSelected ? "selected" : ""
                                }`}
                                onClick={() =>
                                  setSelectedBranchId(String(branch.id))
                                }
                              >
                                <div className="application-branch-head">
                                  <strong>{branch.name}</strong>
                                  <span>{schedules.length} вариантов расписания</span>
                                </div>
                                <div className="application-branch-meta">
                                  <span>
                                    <MapPin size={14} />
                                    {branch.address}
                                  </span>
                                  {branch.phone && (
                                    <span>
                                      <Phone size={14} />
                                      {branch.phone}
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="application-panel">
                      <div className="application-panel-header">
                        <div>
                          <h5>Расписание</h5>
                          <p>Подходящие группы в выбранном филиале</p>
                        </div>
                        <span>
                          {selectedSchedules.length > 0
                            ? `${selectedSchedules.length} групп`
                            : "Сначала выберите филиал"}
                        </span>
                      </div>

                      {selectedSchedules.length > 0 ? (
                        <div className="application-schedule-preview">
                          {selectedSchedules.map((schedule) => {
                            const isSelected =
                              String(schedule.id) === String(selectedScheduleId);

                            return (
                              <button
                                key={schedule.id}
                                type="button"
                                className={`application-preview-item ${
                                  isSelected ? "selected" : ""
                                }`}
                                onClick={() =>
                                  setSelectedScheduleId(String(schedule.id))
                                }
                              >
                                <div>
                                  <strong>{schedule.age_group || "Группа"}</strong>
                                  <span>
                                    {schedule.days_display || "Дни уточняются"}
                                  </span>
                                </div>
                                <div>
                                  <span>
                                    <Clock size={14} />
                                    {schedule.time || "Время уточняется"}
                                  </span>
                                  <span>
                                    <Users size={14} />
                                    {schedule.instructor || "Тренер назначается"}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="application-empty-state">
                          <CalendarIcon size={22} />
                          <p>После выбора филиала здесь появятся доступные группы.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {currentStep === 3 && (
                  <>
                    <div className="application-panel">
                      <div className="application-panel-header">
                        <div>
                          <h5>Комментарий для администратора</h5>
                          <p>
                            Можно указать пожелания по времени, филиалу или задать
                            вопрос по группе.
                          </p>
                        </div>
                      </div>

                      <div className="info-item application-comment-field">
                        <textarea
                          className="application-message-input"
                          value={message}
                          onChange={(event) => setMessage(event.target.value)}
                          rows={6}
                          placeholder="Например: удобно после 18:00, рассматриваем два филиала, нужен созвон перед первой тренировкой"
                        />
                      </div>
                    </div>

                    <div className="application-note muted">
                      <div>
                        <strong>Что будет после отправки</strong>
                        <p>
                          Заявка сразу появится в админ-панели. Администратор увидит
                          выбранного ребёнка, филиал, группу и ваши контакты.
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <aside className="application-wizard-sidebar">
                <div className="application-summary-card">
                  <span className="application-summary-badge">
                    {currentStep === 3 && canContinueStep2
                      ? "Готово к отправке"
                      : "Черновик заявки"}
                  </span>
                  <h4>Сводка заявки</h4>

                  <div className="application-summary-list">
                    <div className="application-summary-row">
                      <strong>Ребёнок</strong>
                      <span>
                        {selectedChild
                          ? `${selectedChild.name} • ${selectedChild.birth_year} г.р.`
                          : "Не выбран"}
                      </span>
                    </div>
                    <div className="application-summary-row">
                      <strong>Контакты</strong>
                      <span>
                        {hasContactInfo
                          ? user?.phone || user?.email
                          : "Нужно заполнить профиль"}
                      </span>
                    </div>
                    <div className="application-summary-row">
                      <strong>Текущий филиал</strong>
                      <span>{selectedChildBranchName}</span>
                    </div>
                    <div className="application-summary-row">
                      <strong>Новый филиал</strong>
                      <span>{selectedBranch?.name || "Не выбран"}</span>
                    </div>
                    <div className="application-summary-row">
                      <strong>Расписание</strong>
                      <span>
                        {selectedSchedule
                          ? `${selectedSchedule.days_display || "Дни"} • ${
                              selectedSchedule.time || "Время уточняется"
                            }`
                          : "Не выбрано"}
                      </span>
                    </div>
                    <div className="application-summary-row">
                      <strong>Тренер</strong>
                      <span>
                        {selectedSchedule?.instructor || "Назначается"}
                      </span>
                    </div>
                  </div>

                  {message.trim() ? (
                    <div className="application-summary-note">
                      <strong>Комментарий</strong>
                      <p>{message.trim()}</p>
                    </div>
                  ) : (
                    <div className="application-summary-placeholder">
                      Комментарий можно добавить на последнем шаге, если он нужен.
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </div>

          <div className="modal-actions application-wizard-actions">
            <div className="application-actions-meta">
              {loadingOptions
                ? "Обновляем доступные филиалы и группы..."
                : "После отправки администратор увидит заявку в админ-панели."}
            </div>

            <div className="application-actions-buttons">
              <button
                type="button"
                className="cancel-btn"
                onClick={currentStep === 1 ? onCancel : handleBack}
              >
                {currentStep === 1 ? "Закрыть" : "Назад"}
              </button>

              {currentStep < 3 ? (
                <button
                  type="button"
                  className="confirm-btn"
                  onClick={handleContinue}
                  disabled={
                    currentStep === 1
                      ? !selectedChild || !selectedChild.birthYearValid || !hasContactInfo
                      : loadingOptions || !selectedBranch || !selectedSchedule
                  }
                >
                  {currentStep === 1
                    ? "Подобрать филиал"
                    : "Проверить заявку"}
                </button>
              ) : (
                <button
                  type="submit"
                  className="confirm-btn"
                  disabled={submitting || !canContinueStep1 || !canContinueStep2}
                >
                  {submitting ? "Сохраняем..." : "Отправить заявку"}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

// Компонент для редактирования профиля
void LegacyApplicationRequestModal;

const ProfileEditForm = ({ user, onSave, onCancel, loading }) => {
  const [formData, setFormData] = useState({
    name: user.name || "",
    phone: user.phone || "",
    email: user.email || "",
  });

  const nameInputRef = useRef(null);

  useEffect(() => {
    if (nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, []);

  const handleChange = useCallback(
    (field) => (e) => {
      setFormData((prev) => ({
        ...prev,
        [field]: e.target.value,
      }));
    },
    [],
  );

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      onSave(formData);
    },
    [formData, onSave],
  );

  return (
    <form onSubmit={handleSubmit}>
      <div className="info-grid">
        <div className="info-item">
          <label>Имя</label>
          <input
            ref={nameInputRef}
            type="text"
            value={formData.name}
            onChange={handleChange("name")}
            placeholder="Введите имя"
            required
          />
        </div>

        <div className="info-item">
          <label>Телефон</label>
          <input
            type="text"
            value={formData.phone}
            onChange={handleChange("phone")}
            placeholder="+7 (___) ___-__-__"
          />
        </div>

        <div className="info-item">
          <label>Email</label>
          <input
            type="email"
            value={formData.email}
            onChange={handleChange("email")}
            placeholder="email@example.com"
          />
        </div>

        <div className="info-item">
          <label>Дата регистрации</label>
          <span>
            {new Date(user.registered_at).toLocaleDateString("ru-RU")}
          </span>
        </div>
      </div>

      <div className="edit-actions" style={{ marginTop: "20px" }}>
        <button className="save-btn" type="submit" disabled={loading}>
          <Save size={16} />
          {loading ? "Сохранение..." : "Сохранить"}
        </button>
        <button
          className="cancel-btn"
          type="button"
          onClick={onCancel}
          disabled={loading}
        >
          <X size={16} />
          Отмена
        </button>
      </div>
    </form>
  );
};

// Компонент для редактирования ребенка
const ChildEditForm = ({ child, onUpdate, onRemove, fetchWithAuth }) => {
  const [name, setName] = useState(child.name || "");
  const [birthYear, setBirthYear] = useState(child.birth_year || "");
  const [selectedBranchId, setSelectedBranchId] = useState(
    child.branch_id || "",
  );
  const [availableBranchesForChild, setAvailableBranchesForChild] = useState(
    [],
  );
  const [loadingBranches, setLoadingBranches] = useState(false);

  // Загружаем доступные филиалы при изменении года рождения
  useEffect(() => {
    const loadBranches = async () => {
      if (birthYear && isValidBirthYear(birthYear)) {
        setLoadingBranches(true);
        try {
          const data = await fetchWithAuth(
            `/api/branches/by-birth-year?birth_year=${birthYear}`,
          );
          if (data.success) {
            setAvailableBranchesForChild(data.branches || []);
          }
        } catch (error) {
          console.error("Ошибка загрузки филиалов:", error);
        } finally {
          setLoadingBranches(false);
        }
      }
    };

    if (birthYear) {
      loadBranches();
    }
  }, [birthYear, fetchWithAuth]);

  const handleBranchChange = useCallback(
    (e) => {
      const branchId = e.target.value;
      setSelectedBranchId(branchId);

      const selectedBranch = availableBranchesForChild.find(
        (b) => b.id === parseInt(branchId),
      );
      if (selectedBranch) {
        onUpdate(child.id, {
          name,
          birth_year: birthYear,
          branch_id: selectedBranch.id,
          branch_name: selectedBranch.name,
          age: calculateAgeFromBirthYear(birthYear),
        });
      }
    },
    [child.id, name, birthYear, availableBranchesForChild, onUpdate],
  );

  const handleBlur = useCallback(() => {
    const age = calculateAgeFromBirthYear(birthYear);
    const selectedBranch = availableBranchesForChild.find(
      (b) => b.id === parseInt(selectedBranchId),
    );

    onUpdate(child.id, {
      name,
      birth_year: birthYear,
      branch_id: selectedBranch?.id,
      branch_name: selectedBranch?.name,
      age: age,
    });
  }, [
    child.id,
    name,
    birthYear,
    selectedBranchId,
    availableBranchesForChild,
    onUpdate,
  ]);

  return (
    <div className="child-edit-form">
      <div className="child-edit-header">
        <div>
          <span className="child-edit-kicker">Карточка ребенка</span>
          <h5>{name.trim() || "Новый ребенок"}</h5>
        </div>
        <div className="child-edit-status">
          <span>{birthYear ? `${birthYear} г.р.` : "Год не указан"}</span>
          <span>
            {selectedBranchId
              ? "Филиал выбран"
              : "Нужно назначить филиал"}
          </span>
        </div>
      </div>

      <div className="child-edit-grid">
        <div className="form-group">
          <label>Имя ребенка</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleBlur}
            placeholder="Введите имя"
            required
          />
        </div>
        <div className="form-group">
          <label>Год рождения</label>
          <input
            type="number"
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            onBlur={handleBlur}
            placeholder={`Например: ${new Date().getFullYear() - 10}`}
            min="2000"
            max={new Date().getFullYear()}
            step="1"
          />
          {birthYear && !isValidBirthYear(birthYear) && (
            <span className="error-text">
              Год рождения должен быть между 2000 и {new Date().getFullYear()}
            </span>
          )}
        </div>
      </div>

      <div className="form-group child-edit-branch-group">
        <label>Филиал</label>
        {loadingBranches ? (
          <div className="loading-branches">Подбираем филиалы под возраст...</div>
        ) : availableBranchesForChild.length > 0 ? (
          <select
            value={selectedBranchId}
            onChange={handleBranchChange}
            disabled={!birthYear || !isValidBirthYear(birthYear)}
          >
            <option value="">Выберите филиал</option>
            {availableBranchesForChild.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name} ({branch.schedule_count} тренировок/нед)
              </option>
            ))}
          </select>
        ) : (
          <div className="no-branches-message">
            {birthYear && isValidBirthYear(birthYear)
              ? "Для этого возраста пока нет доступных филиалов"
              : "Сначала укажите год рождения, чтобы подобрать филиал"}
          </div>
        )}

        {selectedBranchId && (
          <div className="branch-info">
            {availableBranchesForChild
              .find((b) => b.id === parseInt(selectedBranchId))
              ?.schedule?.map((item, idx) => (
                <span key={idx} className="schedule-item">
                  {item.day} {item.time}
                </span>
              ))}
          </div>
        )}
      </div>

      <button
        className="remove-child-btn"
        onClick={() => onRemove(child.id)}
        type="button"
        disabled={!name.trim()}
      >
        <Trash2 size={16} />
        Удалить
      </button>
    </div>
  );
};

// Основной компонент
const UserProfile = () => {
  const [user, setUser] = useState(null);
  const [applications, setApplications] = useState([]);
  const [payments, setPayments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [editingChildren, setEditingChildren] = useState(false);
  const [childrenData, setChildrenData] = useState([]);
  const [savingChildren, setSavingChildren] = useState(false);

  const [activeTab, setActiveTab] = useState("overview");
  const [attendanceFilters, setAttendanceFilters] = useState({
    childId: "all",
    status: "all",
  });

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showApplicationModal, setShowApplicationModal] = useState(false);

  const [selectedChildForPayment, setSelectedChildForPayment] = useState(null);
  const [selectedChildForBranch, setSelectedChildForBranch] = useState(null);
  const [branchSelectionMode, setBranchSelectionMode] = useState("payment");
  const [initialApplicationChildId, setInitialApplicationChildId] =
    useState(null);
  const [selectedPaymentPlan, setSelectedPaymentPlan] = useState(null);
  const [paymentPlans, setPaymentPlans] = useState(() =>
    normalizePaymentPlans(DEFAULT_PAYMENT_PLANS),
  );
  const [availableBranches, setAvailableBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [expandedPayments, setExpandedPayments] = useState({});
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: "",
    message: "",
    confirmLabel: "Подтвердить",
    cancelLabel: "Отмена",
    tone: "default",
    busy: false,
    onConfirm: null,
  });
  const availablePaymentPlans = useMemo(
    () => normalizePaymentPlans(paymentPlans),
    [paymentPlans],
  );
  const paymentSyncRef = useRef(null);

  const checkAuth = useCallback(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "/login";
      return false;
    }
    return true;
  }, []);

  const fetchWithAuth = useCallback(async (url, options = {}) => {
    const token = localStorage.getItem("token");
    if (!token) {
      throw new Error("Требуется авторизация");
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (response.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
      throw new Error("Сессия истекла");
    }

    if (!response.ok) {
      let errorMessage = `Ошибка ${response.status}: ${response.statusText}`;
      const responseType = response.headers.get("content-type") || "";

      try {
        if (responseType.includes("application/json")) {
          const errorData = await response.json();
          errorMessage =
            errorData.error || errorData.message || errorData.details || errorMessage;
        } else {
          const errorText = await response.text();
          if (errorText) {
            errorMessage = errorText;
          }
        }
      } catch (parseError) {
        console.warn("Не удалось разобрать ответ сервера:", parseError);
      }

      throw new Error(errorMessage);
    }

    return response.json();
  }, []);

  const dismissNotification = useCallback((toastId) => {
    setNotifications((prev) => prev.filter((item) => item.id !== toastId));
  }, []);

  const showNotification = useCallback(
    (message, type = "info", title = "") => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      setNotifications((prev) => [
        ...prev,
        {
          id,
          type,
          title,
          message:
            typeof message === "string"
              ? message.replace(/^[^A-Za-zА-Яа-я0-9]+/u, "").trim()
              : "",
        },
      ]);

      window.setTimeout(() => {
        setNotifications((prev) => prev.filter((item) => item.id !== id));
      }, 4200);
    },
    [],
  );

  const closeConfirmDialog = useCallback(() => {
    setConfirmDialog({
      isOpen: false,
      title: "",
      message: "",
      confirmLabel: "Подтвердить",
      cancelLabel: "Отмена",
      tone: "default",
      busy: false,
      onConfirm: null,
    });
  }, []);

  const openConfirmDialog = useCallback((config) => {
    setConfirmDialog({
      isOpen: true,
      title: config.title || "Подтвердите действие",
      message: config.message || "",
      confirmLabel: config.confirmLabel || "Подтвердить",
      cancelLabel: config.cancelLabel || "Отмена",
      tone: config.tone || "default",
      busy: false,
      onConfirm: config.onConfirm || null,
    });
  }, []);

  const handleConfirmDialogConfirm = useCallback(async () => {
    if (typeof confirmDialog.onConfirm !== "function") {
      closeConfirmDialog();
      return;
    }

    setConfirmDialog((prev) => ({ ...prev, busy: true }));

    try {
      await confirmDialog.onConfirm();
      closeConfirmDialog();
    } catch (confirmError) {
      console.error("Ошибка подтверждаемого действия:", confirmError);
      setConfirmDialog((prev) => ({ ...prev, busy: false }));
      showNotification(
        confirmError.message || "Не удалось выполнить действие",
        "error",
      );
    }
  }, [closeConfirmDialog, confirmDialog, showNotification]);

  const loadUserData = useCallback(async () => {
    if (!checkAuth()) return;

    try {
      const data = await fetchWithAuth("/api/profile");

      if (data.user && data.user.children) {
        const currentYear = new Date().getFullYear();
        data.user.children = data.user.children.map((child, index) => {
          const updatedChild = {
            ...child,
            id: child.id || data.user.id * 100 + (index + 1),
          };

          if (child.age && !child.birth_year) {
            updatedChild.birth_year = (
              currentYear - parseInt(child.age)
            ).toString();
          }

          if (!updatedChild.birth_year && !child.age) {
            updatedChild.birth_year = (currentYear - 10).toString();
          }

          return updatedChild;
        });
      }

      setUser(data.user);
      setChildrenData(data.user.children || []);
      setError(null);
    } catch (error) {
      console.error("❌ Ошибка загрузки профиля:", error);
      setError(error.message);
    }
  }, [fetchWithAuth, checkAuth]);

  const loadApplications = useCallback(async () => {
    try {
      const data = await fetchWithAuth("/api/my-applications");
      setApplications(data.applications || []);
    } catch (error) {
      console.error("Ошибка загрузки заявок:", error);
    }
  }, [fetchWithAuth]);

  const loadPayments = useCallback(async () => {
    try {
      const data = await fetchWithAuth("/api/payments/user");
      if (data.success) {
        setPayments(data.payments || []);
      }
    } catch (error) {
      console.error("Ошибка загрузки платежей:", error);
    }
  }, [fetchWithAuth]);

  const loadPaymentPlans = useCallback(async () => {
    try {
      const response = await fetch("/api/site-content");
      if (!response.ok) {
        throw new Error(`Ошибка ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setPaymentPlans(normalizePaymentPlans(data.payment_plans));
      } else {
        setPaymentPlans(normalizePaymentPlans(DEFAULT_PAYMENT_PLANS));
      }
    } catch (error) {
      console.warn("Не удалось загрузить тарифы тренировок:", error);
      setPaymentPlans(normalizePaymentPlans(DEFAULT_PAYMENT_PLANS));
    }
  }, []);

  const loadAttendance = useCallback(
    async (filters = {}) => {
      try {
        const params = new URLSearchParams();
        if (filters.childId && filters.childId !== "all")
          params.append("child_id", filters.childId);
        if (filters.status && filters.status !== "all")
          params.append("status", filters.status);

        const data = await fetchWithAuth(
          `/api/attendance/user?${params.toString()}`,
        );

        if (data.success) {
          setAttendance(data.attendance || []);
        }
      } catch (error) {
        console.error("Ошибка загрузки посещений:", error);
      }
    },
    [fetchWithAuth],
  );

  const loadAllData = useCallback(async () => {
    if (!user) return;

    await Promise.all([loadPayments(), loadAttendance(attendanceFilters)]);
  }, [user, loadPayments, loadAttendance, attendanceFilters]);

  const loadAvailableBranches = useCallback(
    async (birthYear) => {
      setLoadingBranches(true);
      try {
        const data = await fetchWithAuth(
          `/api/branches/by-birth-year?birth_year=${birthYear}`,
        );

        if (data.success) {
          setAvailableBranches(data.branches || []);
        } else {
          setAvailableBranches([]);
          showNotification(data.error || "Ошибка загрузки филиалов", "error");
        }
      } catch (error) {
        console.error("❌ Ошибка загрузки филиалов:", error);
        showNotification("Ошибка загрузки филиалов", "error");
        setAvailableBranches([]);
      } finally {
        setLoadingBranches(false);
      }
    },
    [fetchWithAuth, showNotification],
  );

  const requestBranchSelection = useCallback(
    async (child, mode = "manage") => {
      if (!child) {
        showNotification("Сначала выберите ребенка", "error");
        return;
      }

      if (!child.birth_year || !isValidBirthYear(child.birth_year)) {
        showNotification(
          "Сначала укажите корректный год рождения ребенка",
          "error",
        );
        setActiveTab("children");
        setEditingChildren(true);
        return;
      }

      setBranchSelectionMode(mode);
      setSelectedChildForBranch(child);
      await loadAvailableBranches(child.birth_year);
      setShowBranchModal(true);
    },
    [loadAvailableBranches, showNotification],
  );

  const openApplicationModal = useCallback(
    (child = null) => {
      const validChildren = (user?.children || []).filter(
        (candidate) =>
          candidate.birth_year && isValidBirthYear(candidate.birth_year),
      );

      if (!user?.children?.length) {
        showNotification(
          "Сначала добавьте ребёнка в личный кабинет, чтобы подать заявку.",
          "error",
        );
        setActiveTab("children");
        return;
      }

      if (validChildren.length === 0) {
        showNotification(
          "Для подачи заявки нужен корректный год рождения ребёнка.",
          "error",
        );
        setActiveTab("children");
        setEditingChildren(true);
        return;
      }

      const preferredChild =
        child &&
        validChildren.find(
          (candidate) => String(candidate.id) === String(child.id),
        );
      const targetChild = preferredChild || validChildren[0];

      setInitialApplicationChildId(String(targetChild.id));
      setShowApplicationModal(true);
    },
    [showNotification, user],
  );

  const closeApplicationModal = useCallback(() => {
    setShowApplicationModal(false);
    setInitialApplicationChildId(null);
  }, []);

  const handleApplicationCreated = useCallback(
    (application) => {
      setApplications((prev) => {
        const nextItems = prev.filter((item) => item.id !== application.id);
        return [application, ...nextItems];
      });
      setShowApplicationModal(false);
      setInitialApplicationChildId(null);
      showNotification(
        "Заявка сохранена в личном кабинете и передана администратору.",
        "success",
      );
    },
    [showNotification],
  );

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadUserData(), loadPaymentPlans()]);
      setLoading(false);
    };
    init();
  }, [loadPaymentPlans, loadUserData]);

  useEffect(() => {
    if (user) {
      loadAllData();
    }
  }, [user, loadAllData]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentId = params.get("payment_id");

    if (!paymentId || paymentSyncRef.current === paymentId) {
      return;
    }

    paymentSyncRef.current = paymentId;

    const syncPayment = async () => {
      try {
        const response = await fetchWithAuth(`/api/payments/${paymentId}/sync`, {
          method: "POST",
        });

        await loadPayments();
        setActiveTab("payments");

        const paymentStatus = response?.payment?.status;
        if (paymentStatus === "confirmed") {
          showNotification(
            "Оплата подтверждена. Тренировки уже доступны в личном кабинете.",
            "success",
          );
        } else if (paymentStatus === "failed") {
          showNotification(
            "Оплата не завершена. Можно попробовать снова из раздела оплат.",
            "error",
          );
        } else {
          showNotification(
            "Платеж пока ожидает подтверждения от банка. Статус обновлен в разделе оплат.",
            "info",
          );
        }
      } catch (error) {
        console.error("Ошибка синхронизации платежа после возврата:", error);
        showNotification(
          `Не удалось проверить статус платежа: ${error.message}`,
          "error",
        );
      } finally {
        const cleanUrl = `${window.location.origin}${window.location.pathname}`;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    };

    syncPayment();
  }, [fetchWithAuth, loadPayments, showNotification]);

  useEffect(() => {
    if (!showPaymentModal) {
      return;
    }

    if (availablePaymentPlans.length === 0) {
      if (selectedPaymentPlan) {
        setSelectedPaymentPlan(null);
      }
      return;
    }

    if (
      !selectedPaymentPlan ||
      !availablePaymentPlans.some(
        (plan) => String(plan.id) === String(selectedPaymentPlan.id),
      )
    ) {
      setSelectedPaymentPlan(availablePaymentPlans[0]);
    }
  }, [availablePaymentPlans, selectedPaymentPlan, showPaymentModal]);

  const handleSaveProfile = useCallback(
    async (formData) => {
      setSavingProfile(true);
      try {
        const dataToSend = {
          name: formData.name || "",
          email: formData.email || "",
          phone: formData.phone || "",
          children: user.children || [],
        };

        const data = await fetchWithAuth("/api/profile", {
          method: "PUT",
          body: JSON.stringify(dataToSend),
        });

        setUser(data.user);
        setIsEditingProfile(false);
        localStorage.setItem("user", JSON.stringify(data.user));
        showNotification("✅ Данные успешно сохранены!", "success");

        await loadUserData();
      } catch (error) {
        console.error("❌ Ошибка обновления профиля:", error);
        showNotification(`❌ Ошибка: ${error.message}`, "error");
      } finally {
        setSavingProfile(false);
      }
    },
    [fetchWithAuth, showNotification, loadUserData, user],
  );

  const handleCancelEditProfile = useCallback(() => {
    setIsEditingProfile(false);
  }, []);

  const startEditingChildren = useCallback(() => {
    setChildrenData(user.children ? [...user.children] : []);
    setEditingChildren(true);
  }, [user]);

  const openApplicationProfileEdit = useCallback(() => {
    closeApplicationModal();
    setActiveTab("profile");
    setIsEditingProfile(true);
  }, [closeApplicationModal]);

  const openApplicationChildrenEdit = useCallback(() => {
    closeApplicationModal();
    setActiveTab("children");
    startEditingChildren();
  }, [closeApplicationModal, startEditingChildren]);

  const cancelEditingChildren = useCallback(() => {
    setChildrenData(user.children || []);
    setEditingChildren(false);
  }, [user]);

  const addChild = useCallback(() => {
    const currentYear = new Date().getFullYear();
    const defaultBirthYear = currentYear - 10;

    const newChild = {
      id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: "",
      birth_year: defaultBirthYear.toString(),
      payments: [],
    };
    setChildrenData((prev) => [...prev, newChild]);
  }, []);

  const updateChild = useCallback((childId, updates) => {
    setChildrenData((prev) =>
      prev.map((child) => {
        if (child.id === childId) {
          const updatedChild = { ...child, ...updates };

          // Если есть branch_id, но нет branch_name, устанавливаем временное имя
          if (updatedChild.branch_id && !updatedChild.branch_name) {
            updatedChild.branch_name = `Филиал #${updatedChild.branch_id}`;
          }

          return updatedChild;
        }
        return child;
      }),
    );
  }, []);

  const removeChild = useCallback(
    (childId) => {
      const child = childrenData.find((c) => c.id === childId);
      const childName = child?.name || "без имени";

      openConfirmDialog({
        title: "Удалить ребенка из списка?",
        message: `Карточка "${childName}" пропадет из формы редактирования. Если ребенок уже сохранен в кабинете, изменения вступят в силу после нажатия "Сохранить".`,
        confirmLabel: "Удалить",
        tone: "danger",
        onConfirm: () => {
          setChildrenData((prev) =>
            prev.filter((item) => item.id !== childId),
          );
        },
      });
    },
    [childrenData, openConfirmDialog],
  );

  const validateChildren = useCallback(
    (children) => {
      if (!children || !Array.isArray(children)) return true;

      for (let child of children) {
        if (!child.name || !child.name.trim()) {
          showNotification(
            "❌ Пожалуйста, заполните имя для всех детей",
            "error",
          );
          return false;
        }
        if (!child.birth_year || !isValidBirthYear(child.birth_year)) {
          showNotification(
            "❌ Пожалуйста, укажите правильный год рождения для всех детей",
            "error",
          );
          return false;
        }
      }
      return true;
    },
    [showNotification],
  );

  const saveChildren = useCallback(async () => {
    if (!validateChildren(childrenData)) {
      return;
    }

    setSavingChildren(true);
    try {
      const childrenToSend = childrenData.map((child) => {
        const childData = { ...child };
        if (
          childData.id &&
          typeof childData.id === "string" &&
          childData.id.startsWith("temp_")
        ) {
          delete childData.id;
        }
        return childData;
      });

      const data = await fetchWithAuth("/api/profile", {
        method: "PUT",
        body: JSON.stringify({ children: childrenToSend }),
      });

      setUser(data.user);
      setEditingChildren(false);
      setChildrenData(data.user.children || []);
      localStorage.setItem("user", JSON.stringify(data.user));
      showNotification("✅ Данные детей успешно сохранены!", "success");

      await loadUserData();
    } catch (error) {
      console.error("❌ Ошибка сохранения детей:", error);
      showNotification(`❌ Ошибка: ${error.message}`, "error");
    } finally {
      setSavingChildren(false);
    }
  }, [
    childrenData,
    fetchWithAuth,
    validateChildren,
    showNotification,
    loadUserData,
  ]);

  const initiatePayment = useCallback(
    async (child) => {
      if (!child) {
        showNotification("❌ Сначала выберите ребенка!", "error");
        return;
      }

      if (!child.birth_year || !isValidBirthYear(child.birth_year)) {
        showNotification("❌ Укажите год рождения ребенка в профиле!", "error");
        setActiveTab("children");
        setEditingChildren(true);
        return;
      }

      // Проверяем, есть ли у ребенка выбранный филиал
      if (!child.branch_id) {
        await requestBranchSelection(child, "payment");
        return;
      }

      let validChild = { ...child };

      if (
        !validChild.id ||
        (typeof validChild.id === "string" && validChild.id.startsWith("temp_"))
      ) {
        const savedChild = user?.children?.find(
          (c) => c.name === child.name && c.birth_year === child.birth_year,
        );

        if (savedChild && savedChild.id) {
          validChild = { ...validChild, id: savedChild.id };
        } else {
          showNotification(
            "❌ Сначала сохраните данные ребенка в профиле!",
            "error",
          );
          setActiveTab("children");
          setEditingChildren(true);
          return;
        }
      }

      setSelectedChildForPayment(validChild);
      setSelectedPaymentPlan(availablePaymentPlans[0] || null);
      setShowPaymentModal(true);
    },
    [availablePaymentPlans, user, showNotification, requestBranchSelection],
  );

  const handleSelectBranch = useCallback(
    async (branch) => {
      if (!selectedChildForBranch || !branch) return;

      try {
        // Обновляем ребенка с выбранным филиалом
        const updatedChildren = user.children.map((child) =>
          child.id === selectedChildForBranch.id
            ? { ...child, branch_id: branch.id, branch_name: branch.name }
            : child,
        );

        const data = await fetchWithAuth("/api/profile", {
          method: "PUT",
          body: JSON.stringify({ children: updatedChildren }),
        });

        setUser(data.user);
        setShowBranchModal(false);

        if (branchSelectionMode === "payment") {
          const updatedChild = data.user.children.find(
            (c) => c.id === selectedChildForBranch.id,
          );

          if (updatedChild) {
            setSelectedChildForPayment(updatedChild);
            setSelectedPaymentPlan(availablePaymentPlans[0] || null);
            setShowPaymentModal(true);
          }
        }

        setBranchSelectionMode("payment");
        showNotification("Филиал выбран успешно", "success");
      } catch (error) {
        console.error("❌ Ошибка сохранения филиала:", error);
        showNotification(`❌ Ошибка: ${error.message}`, "error");
      }
    },
    [
      availablePaymentPlans,
      branchSelectionMode,
      selectedChildForBranch,
      user,
      fetchWithAuth,
      showNotification,
    ],
  );

  const processPayment = useCallback(async () => {
    if (!selectedChildForPayment || !selectedPaymentPlan) {
      showNotification("❌ Не выбран ребенок или план оплаты", "error");
      return;
    }

    try {
      let childId = selectedChildForPayment.id;
      let birthYear = selectedChildForPayment.birth_year;
      let branchId = selectedChildForPayment.branch_id;

      // Проверяем год рождения
      if (!birthYear || !isValidBirthYear(birthYear)) {
        showNotification("❌ Укажите правильный год рождения ребенка", "error");
        return;
      }

      // Проверяем наличие филиала
      if (!branchId) {
        showNotification("❌ Сначала выберите филиал для ребенка", "error");
        setShowBranchModal(true);
        return;
      }

      const paymentData = {
        child_id: childId,
        child_name: selectedChildForPayment.name,
        birth_year: parseInt(birthYear),
        plan_id: selectedPaymentPlan.id,
        training_count: selectedPaymentPlan.trainings,
        amount: selectedPaymentPlan.price,
        payment_method: "card",
        branch_id: branchId,
        return_url: `${window.location.origin}/profile`,
      };

      console.log("📤 Отправка платежа с данными для посещений:", paymentData);

      const response = await fetchWithAuth("/api/payments", {
        method: "POST",
        body: JSON.stringify(paymentData),
      });

      if (response.success) {
        if (response.payment?.confirmation_url) {
          setShowPaymentModal(false);
          setSelectedChildForPayment(null);
          setSelectedPaymentPlan(null);
          await loadPayments();
          showNotification(
            "Переходим к оплате. После возврата статус обновится автоматически.",
            "info",
          );
          window.location.assign(response.payment.confirmation_url);
          return;
        }

        showNotification(
          `✅ Платеж создан и отправлен на подтверждение! После подтверждения администратором будут добавлены тренировки.`,
          "success",
        );
        setShowPaymentModal(false);
        setSelectedChildForPayment(null);
        setSelectedPaymentPlan(null);

        // Перезагружаем платежи
        await loadPayments();
        setActiveTab("payments"); // Переходим на вкладку платежей
      } else {
        showNotification(`❌ Ошибка: ${response.error}`, "error");
      }
    } catch (error) {
      console.error("❌ Ошибка проведения оплаты:", error);
      showNotification(
        `❌ Ошибка при проведении оплаты: ${error.message}`,
        "error",
      );
    }
  }, [
    selectedChildForPayment,
    selectedPaymentPlan,
    fetchWithAuth,
    showNotification,
    loadPayments,
  ]);

  const getChildName = useCallback(
    (childId) => {
      if (!user || !user.children) return "Неизвестно";
      const child = user.children.find((c) => c.id === childId);
      return child ? child.name : "Неизвестно";
    },
    [user],
  );

  const formatDate = useCallback((dateString) => {
    if (!dateString) return "Не назначено";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return "Неверная дата";
    }
  }, []);

  const formatDateOnly = useCallback((dateString) => {
    if (!dateString) return "Не назначено";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("ru-RU");
    } catch (e) {
      return "Неверная дата";
    }
  }, []);

  const updateAttendanceFilter = useCallback(
    (filterName, value) => {
      const newFilters = {
        ...attendanceFilters,
        [filterName]: value,
      };
      setAttendanceFilters(newFilters);
      loadAttendance(newFilters);
    },
    [attendanceFilters, loadAttendance],
  );

  const togglePaymentDetails = useCallback((paymentId) => {
    setExpandedPayments((prev) => ({
      ...prev,
      [paymentId]: !prev[paymentId],
    }));
  }, []);

  const handleLogout = useCallback(() => {
    openConfirmDialog({
      title: "Выйти из личного кабинета?",
      message: "Текущая сессия завершится на этом устройстве.",
      confirmLabel: "Выйти",
      tone: "danger",
      onConfirm: () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/";
      },
    });
  }, [openConfirmDialog]);

  const attendanceStats = useMemo(
    () => ({
      attended: attendance.filter((a) => a.status === "attended").length,
      scheduled: attendance.filter((a) => a.status === "scheduled").length,
      rescheduled: attendance.filter((a) => a.status === "rescheduled").length,
    }),
    [attendance],
  );

  const paymentStats = useMemo(
    () => ({
      total: payments.length,
      confirmed: payments.filter((p) => p.status === "confirmed").length,
    }),
    [payments],
  );

  const childSummaries = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return (user?.children || []).map((child) => {
      const childPayments = payments.filter(
        (payment) => String(payment.child_id) === String(child.id),
      );
      const childAttendance = attendance.filter(
        (record) => String(record.child_id) === String(child.id),
      );
      const confirmedPayments = [...childPayments]
        .filter((payment) => payment.status === "confirmed")
        .sort(
          (left, right) =>
            new Date(right.created_at || 0) - new Date(left.created_at || 0),
        );
      const activePayment =
        confirmedPayments.find(
          (payment) => Number(payment.remaining_trainings || 0) > 0,
        ) || confirmedPayments[0] || null;
      const upcomingSessions = childAttendance
        .filter(
          (record) =>
            ["scheduled", "rescheduled"].includes(record.status) &&
            record.scheduled_date &&
            new Date(record.scheduled_date) >= today,
        )
        .sort(
          (left, right) =>
            new Date(left.scheduled_date) - new Date(right.scheduled_date),
        );
      const lastSession = [...childAttendance]
        .filter((record) => record.scheduled_date || record.actual_date)
        .sort(
          (left, right) =>
            new Date(right.actual_date || right.scheduled_date) -
            new Date(left.actual_date || left.scheduled_date),
        )[0];

      return {
        child,
        branchName: child.branch_name || "Филиал не выбран",
        needsBirthYear:
          !child.birth_year || !isValidBirthYear(child.birth_year),
        needsBranch: !child.branch_id,
        pendingPayments: childPayments.filter(
          (payment) => payment.status === "pending",
        ).length,
        activePayment,
        remainingTrainings: Number(activePayment?.remaining_trainings || 0),
        totalTrainings: Number(activePayment?.training_count || 0),
        upcomingSessions,
        nextSession: upcomingSessions[0] || null,
        attendedCount: childAttendance.filter((record) =>
          ["attended", "expired"].includes(record.status),
        ).length,
        missedCount: childAttendance.filter(
          (record) => record.status === "missed",
        ).length,
        lastSession: lastSession || null,
      };
    });
  }, [attendance, payments, user]);

  const overviewStats = useMemo(
    () => ({
      children: childSummaries.length,
      upcoming: childSummaries.reduce(
        (total, item) => total + item.upcomingSessions.length,
        0,
      ),
      remaining: childSummaries.reduce(
        (total, item) => total + item.remainingTrainings,
        0,
      ),
      pending: payments.filter((payment) => payment.status === "pending")
        .length,
    }),
    [childSummaries, payments],
  );

  const overviewActions = useMemo(() => {
    const actions = [];

    if (!user?.phone || !user?.email) {
      actions.push({
        title: "Проверьте контакты родителя",
        description:
          "Телефон и email нужны, чтобы школа могла быстро связаться с вами по оплатам и расписанию.",
        label: "Открыть профиль",
        onClick: () => setActiveTab("profile"),
      });
    }

    if (childSummaries.length === 0) {
      actions.push({
        title: "Добавьте ребенка",
        description:
          "После этого можно будет назначить филиал и перейти к оплате тренировок.",
        label: "Перейти к детям",
        onClick: () => {
          setActiveTab("children");
          startEditingChildren();
        },
      });
    }

    if (
      childSummaries.some((item) => item.needsBirthYear || item.needsBranch)
    ) {
      actions.push({
        title: "Есть незаполненные карточки детей",
        description:
          "Для оплаты и расписания у ребенка должен быть корректный год рождения и назначенный филиал.",
        label: "Исправить детей",
        onClick: () => {
          setActiveTab("children");
          startEditingChildren();
        },
      });
    }

    if (payments.some((payment) => payment.status === "pending")) {
      actions.push({
        title: "Есть незавершенные оплаты",
        description:
          "В разделе оплат можно проверить статус и при необходимости вернуться к оплате.",
        label: "К оплатам",
        onClick: () => setActiveTab("payments"),
      });
    }

    if (actions.length === 0) {
      actions.push({
        title: "Кабинет заполнен",
        description:
          "Сейчас все основные данные в порядке. Ниже можно быстро проверить расписание по каждому ребенку.",
        label: "К посещениям",
        onClick: () => setActiveTab("attendance"),
      });
    }

    return actions;
  }, [childSummaries, payments, startEditingChildren, user]);

  const navigationItems = [
    {
      id: "overview",
      label: "Обзор",
      caption: "что важно сейчас",
      icon: TrendingUp,
    },
    {
      id: "children",
      label: "Дети",
      caption: "карточки и филиалы",
      icon: Users,
    },
    {
      id: "payments",
      label: "Оплаты",
      caption: "история и остаток",
      icon: CreditCard,
    },
    {
      id: "attendance",
      label: "Посещения",
      caption: "тренировки и статусы",
      icon: CalendarIcon,
    },
    {
      id: "profile",
      label: "Профиль",
      caption: "контакты родителя",
      icon: User,
    },
    {
      id: "settings",
      label: "Настройки",
      caption: "сессия и сервис",
      icon: Settings,
    },
  ];

  const activeTabMeta =
    navigationItems.find((item) => item.id === activeTab) || navigationItems[0];

  const upcomingSessionsPreview = useMemo(
    () =>
      childSummaries
        .flatMap((item) =>
          item.upcomingSessions.map((session) => ({
            ...session,
            childName: item.child.name,
            branchName: item.branchName,
          })),
        )
        .sort(
          (left, right) =>
            new Date(left.scheduled_date) - new Date(right.scheduled_date),
        )
        .slice(0, 4),
    [childSummaries],
  );

  const profileCompletion = useMemo(() => {
    const totalChecks = 2 + childSummaries.length * 2;
    let completedChecks = 0;

    if (user?.phone) completedChecks += 1;
    if (user?.email) completedChecks += 1;

    childSummaries.forEach((item) => {
      if (!item.needsBirthYear) completedChecks += 1;
      if (!item.needsBranch) completedChecks += 1;
    });

    if (totalChecks === 0) {
      return 0;
    }

    return Math.round((completedChecks / totalChecks) * 100);
  }, [childSummaries, user]);

  const sidebarMetrics = [
    { label: "Детей", value: overviewStats.children },
    { label: "Скоро занятий", value: overviewStats.upcoming },
    { label: "Остаток", value: overviewStats.remaining },
  ];

  const uniqueBranchCount = useMemo(
    () => new Set(childSummaries.map((item) => item.branchName).filter(Boolean)).size,
    [childSummaries],
  );

  const OverviewTab = () => (
    <div className="lk-tab-layout phub-tabLayout">
      <section className="lk-feature-card lk-feature-card-primary phub-panel">
        <div className="lk-feature-copy">
          <span className="lk-kicker">Сегодня в кабинете</span>
          <h3>Семейный обзор по детям, оплатам и тренировкам</h3>
          <p>
            Здесь видно, кому уже назначен филиал, когда следующее занятие и
            по кому еще нужны действия со стороны родителя.
          </p>
        </div>
        <div className="lk-feature-actions">
          <button className="payment-btn" onClick={() => setActiveTab("children")}>
            <Users size={16} />
            Карточки детей
          </button>
          <button className="edit-btn2" onClick={() => setActiveTab("payments")}>
            <CreditCard size={16} />
            История оплат
          </button>
        </div>
      </section>

      <div className="lk-metric-grid">
        <article className="lk-metric-card">
          <span>Детей в кабинете</span>
          <strong>{overviewStats.children}</strong>
          <p>{uniqueBranchCount} филиалов в текущем наборе</p>
        </article>
        <article className="lk-metric-card">
          <span>Ближайшие тренировки</span>
          <strong>{overviewStats.upcoming}</strong>
          <p>запланированных слотов на ближайший период</p>
        </article>
        <article className="lk-metric-card">
          <span>Остаток тренировок</span>
          <strong>{overviewStats.remaining}</strong>
          <p>по активным подтвержденным оплатам</p>
        </article>
        <article className="lk-metric-card">
          <span>Готовность профиля</span>
          <strong>{profileCompletion}%</strong>
          <p>проверьте контакты, год рождения и филиалы</p>
        </article>
      </div>

      <div className="lk-grid lk-grid-two">
        <section className="lk-surface-card">
          <div className="lk-card-head">
            <div>
              <span className="lk-card-eyebrow">Что сделать дальше</span>
              <h4>Следующие шаги</h4>
            </div>
          </div>
          <div className="lk-action-list">
            {overviewActions.map((action, index) => (
              <article
                key={`${action.title}-${index}`}
                className="lk-action-list-item"
              >
                <div>
                  <h5>{action.title}</h5>
                  <p>{action.description}</p>
                </div>
                <button
                  className="secondary-action-btn"
                  onClick={action.onClick}
                >
                  {action.label}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="lk-surface-card">
          <div className="lk-card-head">
            <div>
              <span className="lk-card-eyebrow">Ближайшие занятия</span>
              <h4>Календарь на подходе</h4>
            </div>
            <button className="edit-btn2" onClick={() => setActiveTab("attendance")}>
              <CalendarIcon size={16} />
              Открыть посещения
            </button>
          </div>

          {upcomingSessionsPreview.length === 0 ? (
            <div className="lk-inline-empty">
              <CalendarIcon size={20} />
              <div>
                <strong>Пока нет ближайших тренировок</strong>
                <p>Они появятся после подтверждения оплаты и формирования расписания.</p>
              </div>
            </div>
          ) : (
            <div className="lk-upcoming-list">
              {upcomingSessionsPreview.map((session) => (
                <article
                  key={session.id}
                  className="lk-upcoming-session"
                >
                  <div>
                    <strong>{session.childName}</strong>
                    <p>{session.branchName}</p>
                  </div>
                  <div className="lk-upcoming-meta">
                    <span>{formatDate(session.scheduled_date)}</span>
                    <StatusBadge status={session.status} />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="lk-surface-card">
        <div className="lk-card-head">
          <div>
            <span className="lk-card-eyebrow">По каждому ребенку</span>
            <h4>Быстрые карточки</h4>
          </div>
          <button
            className="edit-btn2"
            onClick={() => {
              setActiveTab("children");
              startEditingChildren();
            }}
          >
            <Edit size={16} />
            Редактировать список
          </button>
        </div>

        {childSummaries.length === 0 ? (
          <div className="lk-empty-card">
            <Users size={42} />
            <h5>Пока нет ни одного ребенка</h5>
            <p>
              Добавьте ребенка, чтобы кабинет начал показывать филиалы,
              посещения и доступные тренировки.
            </p>
            <button
              className="add-child-btn"
              onClick={() => {
                setActiveTab("children");
                startEditingChildren();
              }}
            >
              Добавить ребенка
            </button>
          </div>
        ) : (
          <div className="lk-child-grid">
            {childSummaries.map((item) => (
              <article key={item.child.id} className="lk-child-card">
                <div className="lk-child-card-head">
                  <div>
                    <h5>{item.child.name}</h5>
                    <p>
                      {item.child.birth_year
                        ? `${item.child.birth_year} г.р.`
                        : "Год рождения не указан"}
                    </p>
                  </div>
                  <StatusBadge
                    status={
                      item.needsBirthYear || item.needsBranch
                        ? "pending"
                        : item.nextSession
                          ? item.nextSession.status
                          : "confirmed"
                    }
                  >
                    {item.needsBirthYear || item.needsBranch
                      ? "Нужно заполнить"
                      : item.nextSession
                        ? "Есть тренировка"
                        : "Все готово"}
                  </StatusBadge>
                </div>

                <div className="lk-detail-grid">
                  <div className="lk-detail-pill">
                    <span>Филиал</span>
                    <strong>{item.branchName}</strong>
                  </div>
                  <div className="lk-detail-pill">
                    <span>Следующее занятие</span>
                    <strong>
                      {item.nextSession
                        ? formatDateOnly(item.nextSession.scheduled_date)
                        : "Пока нет"}
                    </strong>
                  </div>
                  <div className="lk-detail-pill">
                    <span>Остаток</span>
                    <strong>
                      {item.activePayment
                        ? `${item.remainingTrainings} / ${item.totalTrainings}`
                        : "Нет оплаты"}
                    </strong>
                  </div>
                  <div className="lk-detail-pill">
                    <span>Посещено</span>
                    <strong>{item.attendedCount}</strong>
                  </div>
                </div>

                <div className="lk-child-card-actions">
                  {item.needsBranch ? (
                    <button
                      className="secondary-action-btn"
                      onClick={() => requestBranchSelection(item.child)}
                    >
                      <MapPin size={16} />
                      Назначить филиал
                    </button>
                  ) : (
                    <button
                      className="secondary-action-btn"
                      onClick={() => setActiveTab("attendance")}
                    >
                      <CalendarIcon size={16} />
                      К посещениям
                    </button>
                  )}
                  <button
                    className="payment-btn"
                    onClick={() => initiatePayment(item.child)}
                  >
                    <CreditCard size={16} />
                    Оплатить
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  const ProfileTab = () => (
    <div className="lk-tab-layout phub-tabLayout">
      <div className="lk-surface-card phub-panel">
        <div className="section-header">
          <div>
            <span className="lk-card-eyebrow">Контакты родителя</span>
            <h3>Профиль семьи</h3>
          </div>
          {!isEditingProfile ? (
            <button
              className="edit-btn2"
              onClick={() => setIsEditingProfile(true)}
            >
              <Edit size={16} />
              Редактировать
            </button>
          ) : (
            <div className="edit-actions">
              <span style={{ color: "#ccc", fontSize: "0.9rem" }}>
                Редактирование профиля
              </span>
            </div>
          )}
        </div>

        {isEditingProfile ? (
          <ProfileEditForm
            user={user}
            onSave={handleSaveProfile}
            onCancel={handleCancelEditProfile}
            loading={savingProfile}
          />
        ) : (
          <div className="lk-profile-grid">
            <article className="lk-profile-field">
              <label>Имя</label>
              <span>{user.name}</span>
            </article>

            <article className="lk-profile-field">
              <label>Телефон</label>
              <span>{user.phone}</span>
            </article>

            <article className="lk-profile-field">
              <label>Email</label>
              <span>{user.email || "Не указан"}</span>
            </article>

            <article className="lk-profile-field">
              <label>Дата регистрации</label>
              <span>
                {new Date(user.registered_at).toLocaleDateString("ru-RU")}
              </span>
            </article>
          </div>
        )}
      </div>

      {!isEditingProfile && (
        <div className="lk-grid lk-grid-two">
          <section className="lk-surface-card">
            <div className="lk-card-head">
              <div>
                <span className="lk-card-eyebrow">Служебная памятка</span>
                <h4>Что важно держать актуальным</h4>
              </div>
            </div>
            <ul className="lk-bullet-list">
              <li>Телефон нужен для быстрых переносов и подтверждений.</li>
              <li>Email помогает получать подтверждения по заявкам и оплатам.</li>
              <li>Если меняется номер или почта, лучше обновить их сразу здесь.</li>
            </ul>
          </section>

          <section className="lk-surface-card">
            <div className="lk-card-head">
              <div>
                <span className="lk-card-eyebrow">Состояние профиля</span>
                <h4>Готовность кабинета</h4>
              </div>
            </div>
            <div className="lk-progress-card">
              <div className="lk-progress-copy">
                <strong>{profileCompletion}%</strong>
                <span>заполнено в кабинете</span>
              </div>
              <div>
                <p>
                  Чем полнее заполнены контакты и карточки детей, тем меньше
                  ручных уточнений потребуется при записи и оплате.
                </p>
                <div className="lk-linear-progress">
                  <span style={{ width: `${Math.max(profileCompletion, 6)}%` }} />
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );

  const ChildrenTab = () => (
    <div className="lk-tab-layout phub-tabLayout">
      <div className="lk-surface-card phub-panel">
        <div className="section-header">
          <div>
            <span className="lk-card-eyebrow">Детские карточки</span>
            <h3>Дети, филиалы и быстрые действия</h3>
          </div>
          <div className="children-actions">
            {!editingChildren ? (
              <button className="add-child-btn" onClick={startEditingChildren}>
                <Edit size={16} />
                Редактировать детей
              </button>
            ) : (
              <div className="edit-actions">
                <button className="add-child-btn" onClick={addChild}>
                  <Plus size={16} />
                  Добавить ребенка
                </button>
                <button
                  className="save-btn"
                  onClick={saveChildren}
                  disabled={savingChildren}
                >
                  <Save size={16} />
                  {savingChildren ? "Сохранение..." : "Сохранить"}
                </button>
                <button className="cancel-btn" onClick={cancelEditingChildren}>
                  <X size={16} />
                  Отмена
                </button>
              </div>
            )}
          </div>
        </div>

        {editingChildren ? (
          <div className="lk-edit-children-stack">
            {childrenData.map((child) => (
              <div key={child.id} className="child-card lk-edit-child-card">
                <ChildEditForm
                  child={child}
                  onUpdate={updateChild}
                  onRemove={removeChild}
                  fetchWithAuth={fetchWithAuth}
                />
              </div>
            ))}

            {childrenData.length === 0 && (
              <div className="lk-empty-card">
                <Users size={42} />
                <h5>Добавьте первого ребенка</h5>
                <p>После этого можно будет привязать филиал и перейти к оплате.</p>
                <button className="add-child-btn" onClick={addChild}>
                  Добавить ребенка
                </button>
              </div>
            )}
          </div>
        ) : childSummaries.length === 0 ? (
          <div className="lk-empty-card">
            <Users size={42} />
            <h5>Дети еще не добавлены</h5>
            <p>Создайте первую карточку ребенка, чтобы кабинет стал рабочим.</p>
            <button className="add-child-btn" onClick={startEditingChildren}>
              Добавить ребенка
            </button>
          </div>
        ) : (
          <div className="lk-child-grid">
            {childSummaries.map((item) => (
              <article key={item.child.id} className="lk-child-card lk-child-card-full">
                <div className="lk-child-card-head">
                  <div>
                    <h5>{item.child.name}</h5>
                    <p>
                      {item.child.birth_year
                        ? `${item.child.birth_year} г.р.`
                        : "Год рождения не указан"}
                    </p>
                  </div>
                  <StatusBadge
                    status={
                      item.needsBirthYear || item.needsBranch
                        ? "pending"
                        : item.pendingPayments > 0
                          ? "pending"
                          : item.nextSession
                            ? item.nextSession.status
                            : "confirmed"
                    }
                  >
                    {item.needsBirthYear
                      ? "Нужен год рождения"
                      : item.needsBranch
                        ? "Нужен филиал"
                        : item.pendingPayments > 0
                          ? "Есть незавершенная оплата"
                          : item.nextSession
                            ? "Готов к занятиям"
                            : "Данные заполнены"}
                  </StatusBadge>
                </div>

                <div className="lk-detail-grid lk-detail-grid-wide">
                  <div className="lk-detail-pill">
                    <span>Филиал</span>
                    <strong>{item.branchName}</strong>
                  </div>
                  <div className="lk-detail-pill">
                    <span>Следующее занятие</span>
                    <strong>
                      {item.nextSession
                        ? formatDate(item.nextSession.scheduled_date)
                        : "Пока не назначено"}
                    </strong>
                  </div>
                  <div className="lk-detail-pill">
                    <span>Активная оплата</span>
                    <strong>
                      {item.activePayment
                        ? `${item.remainingTrainings} из ${item.totalTrainings} осталось`
                        : "Нет подтвержденной оплаты"}
                    </strong>
                  </div>
                  <div className="lk-detail-pill">
                    <span>Посещено / пропущено</span>
                    <strong>
                      {item.attendedCount} / {item.missedCount}
                    </strong>
                  </div>
                </div>

                <div className="lk-child-card-actions">
                  <button
                    className="secondary-action-btn"
                    onClick={() => requestBranchSelection(item.child)}
                  >
                    <MapPin size={16} />
                    {item.needsBranch ? "Назначить филиал" : "Сменить филиал"}
                  </button>
                  <button
                    className="payment-btn"
                    onClick={() => initiatePayment(item.child)}
                    disabled={
                      !item.child.birth_year ||
                      !isValidBirthYear(item.child.birth_year)
                    }
                  >
                    <CreditCard size={16} />
                    Оплатить тренировки
                  </button>
                  <button
                    className="edit-btn2"
                    onClick={() => setActiveTab("attendance")}
                  >
                    <CalendarIcon size={16} />
                    Смотреть посещения
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const PaymentsTab = () => (
    <div className="lk-tab-layout phub-tabLayout">
      <div className="lk-surface-card phub-panel">
        <div className="section-header">
          <div>
            <span className="lk-card-eyebrow">Финансовая история</span>
            <h3>Оплаты и остаток тренировок</h3>
          </div>
          <div className="payment-stats">
            <div className="stat-badge">
              <DollarSign size={16} />
              <span>Всего оплат: {paymentStats.total}</span>
            </div>
            <div className="stat-badge">
              <CheckCircle size={16} />
              <span>Активных: {paymentStats.confirmed}</span>
            </div>
          </div>
        </div>

        {payments.length === 0 ? (
          <div className="lk-empty-card">
            <CreditCard size={48} />
            <h4>Платежей пока нет</h4>
            <p>Оплатите тренировки для вашего ребенка</p>
            <button
              className="payment-btn"
              onClick={() => setActiveTab("children")}
            >
              Перейти к детям
            </button>
          </div>
        ) : (
          <div className="lk-payment-stack">
            {payments.map((payment) => (
              <article key={payment.id} className="lk-payment-card">
                <div className="lk-payment-card-head">
                  <div className="lk-payment-title">
                    <div>
                      <span className="lk-payment-caption">Платеж #{payment.id}</span>
                      <h4>{payment.child_name || getChildName(payment.child_id)}</h4>
                    </div>
                    <span className="payment-amount">{payment.amount} ₽</span>
                  </div>
                  <div className="lk-payment-head-actions">
                    <StatusBadge status={payment.status} />
                    <button
                      className="toggle-details lk-icon-button"
                      onClick={() => togglePaymentDetails(payment.id)}
                    >
                      {expandedPayments[payment.id] ? (
                        <ChevronUp size={20} />
                      ) : (
                        <ChevronDown size={20} />
                      )}
                    </button>
                  </div>
                </div>

                <div className="lk-payment-meta-grid">
                  <div className="lk-detail-pill">
                    <span>Ребенок:</span>
                    <strong>
                      {payment.child_name || getChildName(payment.child_id)}
                    </strong>
                  </div>
                  <div className="lk-detail-pill">
                    <span>Период:</span>
                    <strong>
                      {formatDateOnly(payment.start_date)} -{" "}
                      {formatDateOnly(payment.end_date)}
                    </strong>
                  </div>
                  <div className="lk-detail-pill">
                    <span>Тренировок:</span>
                    <strong>
                      {payment.used_trainings} / {payment.training_count}
                    </strong>
                  </div>
                  <div className="lk-detail-pill">
                    <span>Остаток:</span>
                    <strong>{payment.remaining_trainings}</strong>
                  </div>
                </div>

                <div className="progress-bar lk-progress-bar">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${
                        (payment.used_trainings / payment.training_count) * 100
                      }%`,
                    }}
                  ></div>
                </div>
                <div className="progress-text">
                  Использовано {payment.used_trainings} из{" "}
                  {payment.training_count} тренировок
                </div>

                {expandedPayments[payment.id] && (
                  <div className="payment-expanded lk-payment-expanded">
                    <div className="expanded-details">
                      <div className="detail-item">
                        <span>Способ оплаты:</span>
                        <span>{payment.payment_method || "Карта"}</span>
                      </div>
                      <div className="detail-item">
                        <span>Дата оплаты:</span>
                        <span>{formatDate(payment.created_at)}</span>
                      </div>
                      <div className="detail-item">
                        <span>Статус:</span>
                        <span>{STATUS_CONFIG[payment.status]?.text || payment.status}</span>
                      </div>
                      {payment.provider_status && (
                        <div className="detail-item">
                          <span>Статус в банке:</span>
                          <span>{payment.provider_status}</span>
                        </div>
                      )}
                    </div>
                    {payment.status === "pending" && payment.payment_url && (
                      <div className="lk-payment-expanded-actions">
                        <button
                          className="payment-btn"
                          onClick={() => window.location.assign(payment.payment_url)}
                        >
                          <CreditCard size={16} />
                          Продолжить оплату
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const AttendanceTab = () => (
    <div className="lk-tab-layout phub-tabLayout">
      <div className="lk-surface-card phub-panel">
        <div className="section-header">
          <div>
            <span className="lk-card-eyebrow">История тренировок</span>
            <h3>Посещения и статусы занятий</h3>
          </div>
          <div className="attendance-stats">
            <div className="stat-badge">
              <CheckCircle size={16} color="#22c55e" />
              <span>Посещено: {attendanceStats.attended}</span>
            </div>
            <div className="stat-badge">
              <ClockIcon size={16} color="#eab308" />
              <span>Запланировано: {attendanceStats.scheduled}</span>
            </div>
            <div className="stat-badge">
              <RefreshCw size={16} color="#3b82f6" />
              <span>Перенесено: {attendanceStats.rescheduled}</span>
            </div>
          </div>
        </div>

        {attendance.length === 0 ? (
          <div className="lk-empty-card">
            <CalendarIcon size={48} />
            <h4>Нет записей о посещениях</h4>
            <p>После оплаты тренировок здесь появятся записи</p>
            <div className="test-data-buttons">
              <button
                className="payment-btn"
                onClick={() => setActiveTab("children")}
              >
                Перейти к детям для оплаты
              </button>
            </div>
          </div>
        ) : (
          <div className="lk-attendance-layout">
            <div className="attendance-filters">
              <div className="filter-group">
                <Filter size={16} />
                <select
                  value={attendanceFilters.childId}
                  onChange={(e) =>
                    updateAttendanceFilter("childId", e.target.value)
                  }
                >
                  <option value="all">Все дети</option>
                  {user.children?.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-group">
                <Filter size={16} />
                <select
                  value={attendanceFilters.status}
                  onChange={(e) =>
                    updateAttendanceFilter("status", e.target.value)
                  }
                >
                  <option value="all">Все статусы</option>
                  <option value="attended">Посещено</option>
                  <option value="scheduled">Запланировано</option>
                  <option value="rescheduled">Перенесено</option>
                </select>
              </div>
            </div>

            <div className="lk-attendance-stack">
              {attendance.map((record) => (
                <article key={record.id} className="lk-attendance-card">
                  <div className="lk-attendance-card-head">
                    <div>
                      <span className="lk-payment-caption">
                        {record.scheduled_date
                          ? formatDate(record.scheduled_date)
                          : "Не назначено"}
                      </span>
                      <h4>{getChildName(record.child_id)}</h4>
                      {record.actual_date && (
                        <p>Фактически: {formatDate(record.actual_date)}</p>
                      )}
                    </div>
                    <StatusBadge status={record.status} />
                  </div>

                  <div className="lk-detail-grid lk-detail-grid-wide">
                    <div className="lk-detail-pill">
                      <span>Тип записи</span>
                      <strong>
                        {record.notes && record.notes.includes("Перенос")
                          ? "Перенесенная тренировка"
                          : "Обычная тренировка"}
                      </strong>
                    </div>
                    <div className="lk-detail-pill">
                      <span>Статус</span>
                      <strong>
                        {STATUS_CONFIG[record.status]?.text || record.status}
                      </strong>
                    </div>
                    <div className="lk-detail-pill">
                      <span>Комментарий</span>
                      <strong>{record.notes || "Без комментария"}</strong>
                    </div>
                    <div className="lk-detail-pill">
                      <span>Ребенок</span>
                      <strong>{getChildName(record.child_id)}</strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const ApplicationsTab = () => (
    <div className="applications-content">
      <div className="applications-header">
        <div className="applications-header-top">
          <div>
            <h3>История заявок</h3>
            <p>Все ваши заявки на тренировки</p>
          </div>
          <button
            type="button"
            className="cta-button application-create-btn"
            onClick={() => openApplicationModal()}
          >
            Новая заявка
          </button>
        </div>
      </div>

      {applications.length === 0 ? (
        <div className="no-applications">
          <Calendar size={64} />
          <h4>Заявок пока нет</h4>
          <p>Оставьте первую заявку на пробную тренировку</p>
          <button
            type="button"
            className="cta-button application-create-btn"
            onClick={() => openApplicationModal()}
          >
            Оставить заявку
          </button>
        </div>
      ) : (
        <div className="applications-list">
          {applications.map((app) => (
            <div key={app.id} className="application-card">
              <div className="app-header">
                <div className="app-info">
                  <span className="app-date">
                    <Clock size={16} />
                    {app.date}
                  </span>
                  <StatusBadge status={app.status} />
                </div>
              </div>
              <div className="app-details">
                <div className="app-detail-item">
                  <strong>Ребенок:</strong>
                  <span>{app.child_name}</span>
                </div>
                <div className="app-detail-item">
                  <strong>Возрастная группа:</strong>
                  <span>{app.age_group}</span>
                </div>
                <div className="app-detail-item">
                  <strong>Филиал:</strong>
                  <span>
                    <MapPin size={14} />
                    {app.branch_name || "Филиал уточняется"}
                  </span>
                </div>
                <div className="app-detail-item">
                  <strong>Тренер:</strong>
                  <span>{app.trainer || "Назначается"}</span>
                </div>
                <div className="app-detail-item">
                  <strong>Расписание:</strong>
                  <span>
                    <Clock size={14} />
                    {app.training_time || "Уточняется администратором"}
                  </span>
                </div>
                <div className="app-detail-item">
                  <strong>Комментарий:</strong>
                  <span>{app.message || "Без комментария"}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const SettingsTab = () => (
    <div className="lk-tab-layout phub-tabLayout">
      <div className="lk-grid lk-grid-two">
        <section className="lk-surface-card phub-panel">
          <div className="lk-card-head">
            <div>
              <span className="lk-card-eyebrow">Аккаунт</span>
              <h3>Управление сессией</h3>
            </div>
          </div>
          <p className="lk-muted-copy">
            Если вы заходили в кабинет с общего устройства, завершите сессию
            после работы.
          </p>
          <div className="settings-actions">
            <button className="logout-btn" onClick={handleLogout}>
              <LogOut size={16} />
              Выйти из аккаунта
            </button>
          </div>
        </section>

        <section className="lk-surface-card phub-panel">
          <div className="lk-card-head">
            <div>
              <span className="lk-card-eyebrow">О кабинете</span>
              <h3>Сервисная информация</h3>
            </div>
          </div>
          <div className="about-info lk-about-stack">
            <p>Футбольная школа "Днепровец"</p>
            <p>Версия 2.1.0</p>
            <p>Личный кабинет родителей для детей, оплат и посещаемости</p>
            <p>© 2024 Все права защищены</p>
          </div>
        </section>
      </div>
    </div>
  );

  if (loading && !isEditingProfile && !editingChildren) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage message={error} onRetry={loadUserData} />;
  }

  if (!user) {
    return (
      <ErrorMessage message="Пользователь не найден" onRetry={loadUserData} />
    );
  }

  return (
    <div className="upx-page">
      <section className="upx-hero">
        <div className="upx-hero-main">
          <span className="lk-card-eyebrow">Личный кабинет родителя</span>
          <h1>{user.name}</h1>
          <p>
            Дети, филиалы, оплаты и посещения собраны в одном месте без лишних
            шагов.
          </p>
          <div className="upx-hero-meta">
            <span className="upx-contact-chip">
              <Phone size={15} />
              {user.phone || "Телефон не указан"}
            </span>
            <span className="upx-contact-chip">
              <Mail size={15} />
              {user.email || "Email не указан"}
            </span>
          </div>
        </div>
        <div className="upx-metric-rack">
          {sidebarMetrics.map((metric) => (
            <div key={metric.label} className="upx-metric-card">
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </div>
          ))}
          <article className="upx-spotlight">
            <small>Ближайший фокус</small>
            <strong>
              {upcomingSessionsPreview[0]
                ? upcomingSessionsPreview[0].childName
                : "Ждем первую тренировку"}
            </strong>
            <p>
              {upcomingSessionsPreview[0]
                ? `Следующее занятие ${formatDateOnly(
                    upcomingSessionsPreview[0].scheduled_date,
                  )}`
                : "После формирования расписания здесь появится ближайший слот по ребенку."}
            </p>
          </article>
        </div>
      </section>

      <nav className="upx-nav">
        {navigationItems.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              className={`upx-nav-button ${activeTab === item.id ? "is-active" : ""}`}
              onClick={() => setActiveTab(item.id)}
            >
              <Icon size={16} />
              <span className="upx-nav-copy">
                <strong>{item.label}</strong>
                <span>{item.caption}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="upx-mobile-nav">
        {navigationItems.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              className={`upx-mobile-chip ${activeTab === item.id ? "is-active" : ""}`}
              onClick={() => setActiveTab(item.id)}
            >
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </div>

      <section className="upx-context">
        <div className="upx-context-copy">
          <small>{activeTabMeta.caption}</small>
          <h2>{activeTabMeta.label}</h2>
        </div>
        <div className="upx-context-signal">
          <Calendar size={15} />
          <span>
            {upcomingSessionsPreview[0]
              ? `Следующее занятие ${formatDateOnly(
                  upcomingSessionsPreview[0].scheduled_date,
                )}`
              : "Ближайшие занятия появятся после формирования расписания"}
          </span>
        </div>
      </section>

      <main className="upx-stage">
        <div className="upx-view">
          {activeTab === "overview" && <OverviewTab />}
          {activeTab === "profile" && <ProfileTab />}
          {activeTab === "children" && <ChildrenTab />}
          {activeTab === "payments" && <PaymentsTab />}
          {activeTab === "attendance" && <AttendanceTab />}
          {activeTab === "settings" && <SettingsTab />}
        </div>
      </main>

      {showBranchModal && (
        <BranchSelectionModal
          child={selectedChildForBranch}
          branches={availableBranches}
          onSelect={handleSelectBranch}
          onCancel={() => {
            setShowBranchModal(false);
            setSelectedChildForBranch(null);
            setBranchSelectionMode("payment");
          }}
          loading={loadingBranches}
        />
      )}

      {showApplicationModal && (
        <ApplicationRequestModal
          user={user}
          initialChildId={initialApplicationChildId}
          fetchWithAuth={fetchWithAuth}
          onCreated={handleApplicationCreated}
          onCancel={closeApplicationModal}
          onEditProfile={openApplicationProfileEdit}
          onEditChildren={openApplicationChildrenEdit}
          showNotification={showNotification}
        />
      )}

      {showPaymentModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowPaymentModal(false)}
        >
          <div className="modaly" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Оплата тренировок</h3>
              <button
                className="close-btn"
                onClick={() => setShowPaymentModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-content">
              <div className="payment-modal-info">
                <p>
                  Ребенок: <strong>{selectedChildForPayment?.name}</strong>
                </p>
                <p>
                  Год рождения:{" "}
                  <strong>
                    {selectedChildForPayment?.birth_year || "не указан"}
                  </strong>
                  {selectedChildForPayment?.birth_year &&
                    isValidBirthYear(selectedChildForPayment.birth_year) && (
                      <span>
                        {" "}
                        (возраст:{" "}
                        {calculateAgeFromBirthYear(
                          selectedChildForPayment.birth_year,
                        )}{" "}
                        лет)
                      </span>
                    )}
                </p>
                {selectedChildForPayment?.branch_name && (
                  <p>
                    Филиал:{" "}
                    <strong>{selectedChildForPayment?.branch_name}</strong>
                  </p>
                )}
              </div>

              <div className="payment-plans-modal">
                {availablePaymentPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className={`payment-plan-modal ${
                      selectedPaymentPlan?.id === plan.id ? "selected" : ""
                    }`}
                    onClick={() => setSelectedPaymentPlan(plan)}
                  >
                    <h4>{plan.name}</h4>
                    <p className="plan-trainings">
                      {plan.trainings} тренировок
                    </p>
                    <p className="plan-price">{plan.price} ₽</p>
                    <p className="plan-description">{plan.description}</p>
                  </div>
                ))}
              </div>

              {selectedPaymentPlan && (
                <div className="payment-summary">
                  <h4>Сводка платежа:</h4>
                  <div className="summary-details">
                    <p>Ребенок: {selectedChildForPayment?.name}</p>
                    <p>Год рождения: {selectedChildForPayment?.birth_year}</p>
                    <p>
                      Филиал:{" "}
                      {selectedChildForPayment?.branch_name || "Не выбран"}
                    </p>
                    <p>Пакет: {selectedPaymentPlan.name}</p>
                    <p>
                      Количество тренировок: {selectedPaymentPlan.trainings}
                    </p>
                    <p className="summary-total">
                      Итого: {selectedPaymentPlan.price} ₽
                    </p>
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <button
                  className="cancel-btn"
                  onClick={() => setShowPaymentModal(false)}
                >
                  Отмена
                </button>
                <button
                  className="confirm-btn"
                  onClick={processPayment}
                  disabled={
                    !selectedPaymentPlan ||
                    !selectedChildForPayment?.birth_year ||
                    !isValidBirthYear(selectedChildForPayment.birth_year) ||
                    !selectedChildForPayment?.branch_id
                  }
                >
                  <CreditCard size={16} />
                  Оплатить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ToastStack toasts={notifications} onDismiss={dismissNotification} />
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        cancelLabel={confirmDialog.cancelLabel}
        tone={confirmDialog.tone}
        busy={confirmDialog.busy}
        onCancel={closeConfirmDialog}
        onConfirm={handleConfirmDialogConfirm}
      />
    </div>
  );
};

export default UserProfile;
