import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Calendar,
  Users,
  Clock,
  Plus,
  Trash2,
  Edit2,
  X,
  Save,
  Filter,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Check,
  Building,
  Settings,
  UserPlus,
  DollarSign,
  Download,
  Upload,
  Eye,
  EyeOff,
  Search,
  RefreshCw,
  Loader,
  MoreVertical,
  Star,
  AlertCircle,
  CheckCircle,
  CalendarDays,
  UserCheck,
  CalendarClock,
  ChevronDown,
  LogOut,
  CreditCard,
  FileText,
  Menu,
} from "lucide-react";
import ToastStack from "../components/ui/ToastStack.jsx";
import ConfirmDialog from "../components/ui/ConfirmDialog.jsx";

// Конфигурация API
const API_BASE_URL = "http://localhost:5000";

// Используем годо-группы как в бэкенде
const initialAgeGroups = [
  "2020-2021",
  "2018-2019",
  "2016-2017",
  "2014-2015",
  "2012-2013",
  "2010-2011",
  "2009-старше",
];

// ИСПРАВЛЕНИЕ 1: Сдвигаем дни недели на 1 влево для правильного отображения
const weekDays = [
  { id: "monday", label: "Понедельник", short: "Пн", number: 0 },
  { id: "tuesday", label: "Вторник", short: "Вт", number: 1 },
  { id: "wednesday", label: "Среда", short: "Ср", number: 2 },
  { id: "thursday", label: "Четверг", short: "Чт", number: 3 },
  { id: "friday", label: "Пятница", short: "Пт", number: 4 },
  { id: "saturday", label: "Суббота", short: "Сб", number: 5 },
  { id: "sunday", label: "Воскресенье", short: "Вс", number: 6 },
];

// Для отображения в календаре (сдвиг на 1 влево)
const calendarWeekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const BRANCH_PHOTO_MAX_SIZE = 5 * 1024 * 1024;

const getEmptyBranchForm = () => ({
  id: null,
  name: "",
  address: "",
  phone: "",
  email: "",
  photoData: null,
  status: "active",
});

const getEmptyUserChild = () => ({
  id: `new-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  name: "",
  birth_year: "",
  branch_id: "",
});

const getEmptyUserForm = () => ({
  id: null,
  name: "",
  email: "",
  phone: "",
  password: "",
  children: [getEmptyUserChild()],
});

const getEmptyTrainer = () => ({
  name: "",
  title: "",
  description: "",
  photo_data: "",
});

const getEmptyAchievementItem = () => ({
  value: "",
  title: "",
  description: "",
});

const getEmptyAchievementNewsItem = () => ({
  title: "",
  date: "",
  tag: "",
  summary: "",
  content: "",
});

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

const createPaymentPlanId = () =>
  `plan-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const getEmptyPaymentPlan = () => ({
  id: createPaymentPlanId(),
  name: "",
  trainings: "",
  price: "",
  description: "",
});

const normalizeTrainerContent = (trainer) => ({
  ...getEmptyTrainer(),
  ...(trainer || {}),
  photo_data:
    typeof (trainer || {}).photo_data === "string"
      ? trainer.photo_data
      : typeof (trainer || {}).photoData === "string"
        ? trainer.photoData
        : "",
});

const hasTrainerContent = (trainer) =>
  Boolean(
    trainer?.name?.trim() ||
      trainer?.title?.trim() ||
      trainer?.description?.trim() ||
      trainer?.photo_data?.trim(),
  );

const normalizeAchievementItem = (item) => ({
  ...getEmptyAchievementItem(),
  ...(item || {}),
});

const normalizeAchievementNewsItem = (item) => ({
  ...getEmptyAchievementNewsItem(),
  ...(item || {}),
});

const normalizePaymentPlanContent = (plan, fallbackId = null) => {
  const normalizedTrainings = Number.parseInt(plan?.trainings, 10);
  const normalizedPrice = Number.parseInt(plan?.price, 10);

  return {
    id: String(plan?.id || fallbackId || createPaymentPlanId()),
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

const hasPaymentPlanContent = (plan) =>
  Boolean(
    plan?.name?.trim() ||
      String(plan?.trainings ?? "").trim() ||
      String(plan?.price ?? "").trim() ||
      plan?.description?.trim(),
  );

const normalizePaymentPlansContent = (plans) => {
  if (!Array.isArray(plans) || plans.length === 0) {
    return DEFAULT_PAYMENT_PLANS.map((plan) =>
      normalizePaymentPlanContent(plan, plan.id),
    );
  }

  const normalizedPlans = plans
    .map((plan, index) =>
      normalizePaymentPlanContent(plan, `payment-plan-${index + 1}`),
    )
    .filter(hasPaymentPlanContent);

  return normalizedPlans.length > 0
    ? normalizedPlans
    : DEFAULT_PAYMENT_PLANS.map((plan) =>
        normalizePaymentPlanContent(plan, plan.id),
      );
};

const normalizeAchievementsContent = (achievements) => ({
  ...getDefaultSiteContent().achievements,
  ...(achievements || {}),
  items:
    Array.isArray(achievements?.items) && achievements.items.length > 0
      ? achievements.items.map(normalizeAchievementItem)
      : getDefaultSiteContent().achievements.items,
  news:
    Array.isArray(achievements?.news) && achievements.news.length > 0
      ? achievements.news.map(normalizeAchievementNewsItem)
      : getDefaultSiteContent().achievements.news,
});

const getDefaultSiteContent = () => ({
  contactInfo: {
    phone: "",
    email: "",
    address: "",
    working_hours: "",
  },
  paymentPlans: DEFAULT_PAYMENT_PLANS.map((plan) =>
    normalizePaymentPlanContent(plan, plan.id),
  ),
  trainers: [getEmptyTrainer()],
  achievements: {
    title: "",
    intro: "",
    items: [getEmptyAchievementItem()],
    news: [getEmptyAchievementNewsItem()],
  },
});

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });

const mapBranchFromApi = (branch) => ({
  id: branch.id,
  name: branch.name,
  address: branch.address,
  phone: branch.phone,
  email: branch.email,
  photoData: branch.photo_data || null,
  status: branch.is_active ? "active" : "inactive",
  capacity: 30,
  schedules: branch.schedule_count || 0,
});

const adminViewConfigs = [
  {
    id: "dashboard",
    label: "Главная",
    title: "Панель управления",
    subtitle: "Обзор статистики и быстрые действия",
    icon: BarChart3,
  },
  {
    id: "schedule",
    label: "Расписание",
    title: "Управление расписанием",
    subtitle: "Создание и редактирование тренировок по возрастным диапазонам",
    icon: Calendar,
  },
  {
    id: "calendar",
    label: "Календарь",
    title: "Календарь тренировок",
    subtitle: "Просмотр дней занятий и отметка посещаемости по дате",
    icon: CalendarDays,
  },
  {
    id: "users",
    label: "Пользователи",
    title: "Пользователи и дети",
    subtitle: "Работа с родителями, детьми и привязанными филиалами",
    icon: Users,
  },
  {
    id: "branches",
    label: "Филиалы",
    title: "Филиалы",
    subtitle: "Контакты филиалов, фотографии и доступность площадок",
    icon: Building,
  },
  {
    id: "payments",
    label: "Оплаты",
    title: "Оплаты",
    subtitle: "Контроль платежей, абонементов и остатков тренировок",
    icon: CreditCard,
  },
  {
    id: "settings",
    label: "Настройки",
    title: "Настройки админки",
    subtitle: "Контент сайта и выгрузка сводок по данным школы",
    icon: Settings,
  },
];

const reportSheetLabels = [
  "Обзор",
  "Пользователи",
  "Дети",
  "Оплаты",
  "Посещаемость",
  "Филиалы",
  "Расписание",
  "Заявки",
];

const USERS_PER_PAGE = 8;
const PAYMENTS_PER_PAGE = 10;

const getDownloadFilename = (contentDisposition, fallbackName) => {
  if (!contentDisposition) {
    return fallbackName;
  }

  const utfMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch (error) {
      console.warn("Не удалось декодировать имя файла:", error);
    }
  }

  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] || fallbackName;
};

const AdminDashboard = () => {
  // Состояния для навигации
  const [activeView, setActiveView] = useState("dashboard");
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 992 : false,
  );
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

  // Состояния для расписания
  const [schedules, setSchedules] = useState([]);
  const [showAddScheduleModal, setShowAddScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);

  // Форма добавления/редактирования расписания
  const [scheduleForm, setScheduleForm] = useState({
    ageGroup: "",
    startTime: "17:00",
    endTime: "18:00",
    branchId: "",
    days: [],
    maxCapacity: 15,
    instructor: "",
    isStartTimeManual: false,
    isEndTimeManual: false,
  });

  // Состояния для филиалов
  const [branches, setBranches] = useState([]);
  const [showAddBranchModal, setShowAddBranchModal] = useState(false);
  const [showEditBranchModal, setShowEditBranchModal] = useState(false);
  const [branchForm, setBranchForm] = useState(getEmptyBranchForm());

  // Состояния для календаря
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedAgeGroup, setSelectedAgeGroup] = useState("all");
  const [selectedBranchFilter, setSelectedBranchFilter] = useState("all");
  const [dayDetails, setDayDetails] = useState(null);
  const [calendarSessionsByDate, setCalendarSessionsByDate] = useState({});

  // Состояния для пользователей
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState(getEmptyUserForm());
  const [savingUser, setSavingUser] = useState(false);
  const [userSort, setUserSort] = useState({
    field: "registered_at",
    direction: "desc",
  });
  const [usersPage, setUsersPage] = useState(1);

  // Состояния для оплат
  const [payments, setPayments] = useState([]);
  const [paymentFilters, setPaymentFilters] = useState({
    status: "all",
    userId: "all",
    branchId: "all",
  });
  const [paymentSearchTerm, setPaymentSearchTerm] = useState("");
  const [paymentSort, setPaymentSort] = useState({
    field: "created_at",
    direction: "desc",
  });
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [siteContent, setSiteContent] = useState(getDefaultSiteContent());
  const [savingSiteContent, setSavingSiteContent] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [showPaymentPlanModal, setShowPaymentPlanModal] = useState(false);
  const [editingPaymentPlanIndex, setEditingPaymentPlanIndex] = useState(null);
  const [paymentPlanForm, setPaymentPlanForm] = useState(getEmptyPaymentPlan());
  const [showTrainerModal, setShowTrainerModal] = useState(false);
  const [editingTrainerIndex, setEditingTrainerIndex] = useState(null);
  const [trainerForm, setTrainerForm] = useState(getEmptyTrainer());

  // ИСПРАВЛЕНИЕ 2: Загружаем настройки из localStorage при инициализации

  // Инициализация
  const [isInitialized, setIsInitialized] = useState(false);

  const dismissNotification = useCallback((toastId) => {
    setNotifications((prev) => prev.filter((item) => item.id !== toastId));
  }, []);

  // Функция для показа уведомлений
  const showNotification = useCallback((message, type = "success") => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setNotifications((prev) => [
      ...prev,
      {
        id,
        type,
        message:
          typeof message === "string"
            ? message.replace(/^[^A-Za-zА-Яа-я0-9]+/u, "").trim()
            : "",
      },
    ]);

    window.setTimeout(() => {
      setNotifications((prev) => prev.filter((item) => item.id !== id));
    }, 4200);
  }, []);

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

  const ageGroupOptions = Array.from(
    new Set(schedules.map((schedule) => schedule.ageGroup).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right, "ru"));
  const scheduleAgeGroupOptions =
    ageGroupOptions.length > 0 ? ageGroupOptions : initialAgeGroups;
  const activeViewConfig =
    adminViewConfigs.find((view) => view.id === activeView) ||
    adminViewConfigs[0];
  const trainerCards = useMemo(
    () =>
      siteContent.trainers
        .map((trainer, index) => ({
          trainer: normalizeTrainerContent(trainer),
          index,
        }))
        .filter(({ trainer }) => hasTrainerContent(trainer)),
    [siteContent.trainers],
  );
  const paymentPlanCards = useMemo(
    () =>
      siteContent.paymentPlans
        .map((plan, index) => ({
          plan: normalizePaymentPlanContent(plan, `payment-plan-${index + 1}`),
          index,
        }))
        .filter(({ plan }) => hasPaymentPlanContent(plan)),
    [siteContent.paymentPlans],
  );
  const totalChildrenCount = users.reduce(
    (total, user) => total + (user.children?.length || 0),
    0,
  );
  const activeBranchesCount = branches.filter(
    (branch) => branch.status === "active",
  ).length;
  const confirmedPaymentsCount = payments.filter(
    (payment) => payment.status === "confirmed",
  ).length;

  // Получение токена администратора
  const getAdminToken = () => {
    return localStorage.getItem("adminToken");
  };

  // Проверка авторизации
  const checkAuth = useCallback(() => {
    const token = getAdminToken();
    if (!token) {
      showNotification("Требуется авторизация администратора", "error");
      setTimeout(() => {
        window.location.href = "/admin/login";
      }, 1500);
      return false;
    }
    return true;
  }, [showNotification]);

  // Функция для валидации времени
  const validateTime = (time) => {
    if (!time || time === "") return false;

    // Убираем пробелы
    time = time.trim();

    // Проверяем формат ЧЧ:ММ или Ч:ММ
    const timeRegex = /^([0-9]|0[0-9]|1[0-9]|2[0-3]):([0-5][0-9])$/;

    if (!timeRegex.test(time)) return false;

    const [hours, minutes] = time.split(":").map(Number);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
  };

  // Функция для нормализации времени (приведение к формату ЧЧ:ММ)
  const normalizeTime = (time) => {
    if (!time || time === "") return "";

    // Если время уже в правильном формате, возвращаем как есть
    if (validateTime(time)) {
      const [hours, minutes] = time.split(":").map(Number);
      return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}`;
    }

    return time;
  };

  // Упрощенная функция форматирования времени при вводе
  const formatTimeInput = (value) => {
    // Удаляем все кроме цифр
    let digits = value.replace(/\D/g, "");

    if (digits.length === 0) return "";

    if (digits.length === 1) {
      return digits;
    }

    if (digits.length === 2) {
      return digits + ":";
    }

    if (digits.length === 3) {
      return digits.substring(0, 2) + ":" + digits.substring(2, 3) + "0";
    }

    if (digits.length >= 4) {
      let hours = digits.substring(0, 2);
      let minutes = digits.substring(2, 4);

      // Ограничиваем часы до 23
      if (parseInt(hours) > 23) {
        hours = "23";
      }

      // Ограничиваем минуты до 59
      if (parseInt(minutes) > 59) {
        minutes = "59";
      }

      return hours + ":" + minutes;
    }

    return value;
  };

  // Обработчик изменения времени начала
  const handleStartTimeChange = (e) => {
    const rawValue = e.target.value;
    const formatted = formatTimeInput(rawValue);

    setScheduleForm((prev) => ({
      ...prev,
      startTime: formatted,
      isStartTimeManual: true,
    }));

    // Если время окончания не было изменено вручную и время начала валидно
    if (!scheduleForm.isEndTimeManual && validateTime(formatted)) {
      const [hours, minutes] = formatted.split(":").map(Number);
      const endHours = hours + 1;

      // Проверяем, чтобы не выйти за 23:59
      if (endHours <= 23) {
        const endTime = `${endHours.toString().padStart(2, "0")}:${minutes
          .toString()
          .padStart(2, "0")}`;
        setScheduleForm((prev) => ({
          ...prev,
          endTime: endTime,
        }));
      } else {
        // Если следующий час выходит за 23, ставим 23:59
        setScheduleForm((prev) => ({
          ...prev,
          endTime: "23:59",
        }));
      }
    }
  };

  // Обработчик потери фокуса для времени начала
  const handleStartTimeBlur = (e) => {
    const value = e.target.value;

    if (value && value !== "") {
      // Проверяем, есть ли двоеточие
      if (!value.includes(":")) {
        // Если ввели только цифры без двоеточия (например 1730)
        const digits = value.replace(/\D/g, "");
        if (digits.length === 3) {
          // 173 -> 17:30
          const normalized =
            digits.substring(0, 2) + ":" + digits.substring(2, 3) + "0";
          setScheduleForm((prev) => ({
            ...prev,
            startTime: normalized,
          }));
        } else if (digits.length === 4) {
          // 1730 -> 17:30
          const normalized =
            digits.substring(0, 2) + ":" + digits.substring(2, 4);
          setScheduleForm((prev) => ({
            ...prev,
            startTime: normalized,
          }));
        }
      } else {
        // Если есть двоеточие, нормализуем
        const normalized = normalizeTime(value);
        setScheduleForm((prev) => ({
          ...prev,
          startTime: normalized,
        }));
      }
    }
  };

  // Обработчик изменения времени окончания
  const handleEndTimeChange = (e) => {
    const rawValue = e.target.value;
    const formatted = formatTimeInput(rawValue);

    setScheduleForm((prev) => ({
      ...prev,
      endTime: formatted,
      isEndTimeManual: true,
    }));
  };

  // Обработчик потери фокуса для времени окончания
  const handleEndTimeBlur = (e) => {
    const value = e.target.value;

    if (value && value !== "") {
      // Проверяем, есть ли двоеточие
      if (!value.includes(":")) {
        // Если ввели только цифры без двоеточия
        const digits = value.replace(/\D/g, "");
        if (digits.length === 3) {
          // 183 -> 18:30
          const normalized =
            digits.substring(0, 2) + ":" + digits.substring(2, 3) + "0";
          setScheduleForm((prev) => ({
            ...prev,
            endTime: normalized,
          }));
        } else if (digits.length === 4) {
          // 1830 -> 18:30
          const normalized =
            digits.substring(0, 2) + ":" + digits.substring(2, 4);
          setScheduleForm((prev) => ({
            ...prev,
            endTime: normalized,
          }));
        }
      } else {
        // Если есть двоеточие, нормализуем
        const normalized = normalizeTime(value);
        setScheduleForm((prev) => ({
          ...prev,
          endTime: normalized,
        }));
      }
    }
  };

  // Функция для расчета продолжительности
  const calculateDuration = () => {
    if (
      !validateTime(scheduleForm.startTime) ||
      !validateTime(scheduleForm.endTime)
    ) {
      return null;
    }

    const [startH, startM] = scheduleForm.startTime.split(":").map(Number);
    const [endH, endM] = scheduleForm.endTime.split(":").map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (endMinutes <= startMinutes) return null;

    const durationMinutes = endMinutes - startMinutes;
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;

    return { hours, minutes, total: durationMinutes };
  };

  // Вспомогательная функция для преобразования dayId в номер дня
  const getDayNumberFromId = (dayId) => {
    const dayMap = {
      monday: 0,
      tuesday: 1,
      wednesday: 2,
      thursday: 3,
      friday: 4,
      saturday: 5,
      sunday: 6,
    };
    return dayMap[dayId] || 0;
  };

  // Вспомогательная функция для преобразования номера дня в dayId
  const getDayIdFromNumber = (dayNumber) => {
    const dayMap = [
      "monday", // 0
      "tuesday", // 1
      "wednesday", // 2
      "thursday", // 3
      "friday", // 4
      "saturday", // 5
      "sunday", // 6
    ];
    return dayMap[dayNumber] || "monday";
  };

  // Функция для выполнения API запросов
  const makeRequest = async (endpoint, options = {}) => {
    const token = getAdminToken();
    if (!token) {
      throw new Error("Требуется авторизация");
    }

    const defaultHeaders = {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    const response = await fetch(`${endpoint}`, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    });

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch (parseError) {
        console.warn("Не удалось прочитать текст ошибки ответа:", parseError);
      }

      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("adminToken");
        showNotification("Сессия истекла. Пожалуйста, войдите снова", "error");
        setTimeout(() => {
          window.location.href = "/admin/login";
        }, 1500);
        throw new Error("Unauthorized");
      }
      throw new Error(errorMessage);
    }

    return response.json();
  };

  // Функция для загрузки расписаний с сервера
  const loadSchedulesFromServer = async () => {
    try {
      const response = await makeRequest("/api/admin/age-schedules");

      if (response.success && response.schedules) {
        const uniqueSchedules = [];
        const processedIds = new Set();

        response.schedules.forEach((schedule) => {
          if (processedIds.has(schedule.id)) return;
          processedIds.add(schedule.id);

          const dayNumbers = Array.isArray(schedule.days_of_week)
            ? schedule.days_of_week
            : schedule.day_of_week !== undefined
              ? [schedule.day_of_week]
              : [0];

          const dayDisplayNames = dayNumbers.map(
            (dayNumber) => weekDays[dayNumber]?.short || "?",
          );

          uniqueSchedules.push({
            id: schedule.id,
            ageGroup: schedule.age_group,
            startTime: schedule.time,
            endTime:
              schedule.end_time ||
              (() => {
                const [hours, minutes] = schedule.time.split(":").map(Number);
                const endHours = hours + 1;
                return `${endHours.toString().padStart(2, "0")}:${minutes
                  .toString()
                  .padStart(2, "0")}`;
              })(),
            branchId: schedule.branch_id.toString(),
            days: dayNumbers.map((dayNum) => getDayIdFromNumber(dayNum)),
            dayNumbers: dayNumbers,
            maxCapacity: schedule.capacity || 15,
            instructor: schedule.instructor || "",
            branchName: schedule.branch_name || "Неизвестно",
            isActive: schedule.is_active !== false,
            allDaysDisplay: dayDisplayNames.join(", "),
            time: schedule.time,
          });
        });

        console.log("✅ Загружены расписания:", uniqueSchedules);
        return uniqueSchedules;
      }
    } catch (error) {
      console.error("❌ Ошибка загрузки расписаний:", error);
      showNotification("Ошибка загрузки расписаний", "error");
    }
    return [];
  };

  // Функция для определения годо-группы по году рождения
  const getAgeGroupFromBirthYear = useCallback((birthYear) => {
    if (!birthYear) return "Не указана";
    if (birthYear >= 2020) return "2020-2021";
    if (birthYear >= 2018) return "2018-2019";
    if (birthYear >= 2016) return "2016-2017";
    if (birthYear >= 2014) return "2014-2015";
    if (birthYear >= 2012) return "2012-2013";
    if (birthYear >= 2010) return "2010-2011";
    return "2009 и старше";
  }, []);

  // Функция для загрузки всех данных
  const loadAllData = async () => {
    if (!checkAuth()) return;

    setLoading(true);
    try {
      const loadedSchedules = await loadSchedulesFromServer();
      setSchedules(loadedSchedules);

      const usersResult = await makeRequest("/api/admin/users");
      if (usersResult.success) {
        const formattedUsers = usersResult.users.map((user) => {
          let ageGroup = "Не указана";
          let birthYear = null;
          if (user.children && user.children.length > 0) {
            const firstChild = user.children[0];
            if (firstChild.birth_year) {
              birthYear = firstChild.birth_year;
              ageGroup = getAgeGroupFromBirthYear(firstChild.birth_year);
            }
          }
          return {
            id: user.id,
            name: user.name || "Без имени",
            email: user.email || "",
            phone: user.phone || "",
            birthYear: birthYear,
            ageGroup: ageGroup,
            children: user.children || [],
            registered_at: user.registered_at,
            stats: user.stats || {},
          };
        });
        setUsers(formattedUsers);
      }

      const branchesResult = await makeRequest("/api/admin/branches");
      if (branchesResult.success && branchesResult.branches) {
        const formattedBranches = branchesResult.branches.map(mapBranchFromApi);
        setBranches(formattedBranches);
      }

      const paymentsResult = await makeRequest("/api/admin/payments");
      if (paymentsResult.success) {
        setPayments(paymentsResult.payments || []);
      }
      const siteContentResult = await makeRequest("/api/admin/site-content");
      if (siteContentResult.success) {
        setSiteContent({
          contactInfo:
            siteContentResult.contact_info ||
            getDefaultSiteContent().contactInfo,
          paymentPlans: normalizePaymentPlansContent(
            siteContentResult.payment_plans,
          ),
          trainers:
            siteContentResult.trainers?.length > 0
              ? siteContentResult.trainers.map(normalizeTrainerContent)
              : getDefaultSiteContent().trainers,
          achievements: normalizeAchievementsContent(
            siteContentResult.achievements,
          ),
        });
      }
      await loadCalendarMonth(currentMonth);

      showNotification(`✅ Данные успешно загружены`);
    } catch (error) {
      console.error("Ошибка загрузки данных:", error);
      showNotification("Ошибка загрузки данных с сервера", "error");
    } finally {
      setLoading(false);
    }
  };

  // Загрузка данных при монтировании
  useEffect(() => {
    if (!isInitialized) {
      loadAllData();
      setIsInitialized(true);
    }
  }, [isInitialized]);

  useEffect(() => {
    const handleResize = () => {
      const mobileViewport = window.innerWidth <= 992;
      setIsMobileViewport(mobileViewport);
      if (!mobileViewport) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ========== ФУНКЦИИ ДЛЯ РАСПИСАНИЯ ==========

  const handleAddSchedule = async () => {
    const normalizedStartTime = normalizeTime(scheduleForm.startTime);
    const normalizedEndTime = normalizeTime(scheduleForm.endTime);
    const isStartTimeValid = validateTime(normalizedStartTime);
    const isEndTimeValid = validateTime(normalizedEndTime);

    if (
      !scheduleForm.ageGroup ||
      !scheduleForm.branchId ||
      scheduleForm.days.length === 0 ||
      !isStartTimeValid ||
      !isEndTimeValid
    ) {
      showNotification("Заполните все обязательные поля корректно", "error");
      return;
    }

    const [startH, startM] = normalizedStartTime.split(":").map(Number);
    const [endH, endM] = normalizedEndTime.split(":").map(Number);

    if (endH * 60 + endM <= startH * 60 + startM) {
      showNotification(
        "Время окончания должно быть позже времени начала",
        "error",
      );
      return;
    }

    try {
      const dayNumbers = scheduleForm.days.map((dayId) =>
        getDayNumberFromId(dayId),
      );

      const scheduleData = {
        age_group: scheduleForm.ageGroup,
        days_of_week: dayNumbers,
        time: normalizedStartTime,
        end_time: normalizedEndTime,
        branch_id: parseInt(scheduleForm.branchId),
        capacity: scheduleForm.maxCapacity,
        instructor: scheduleForm.instructor || "",
        is_active: true,
      };

      console.log("📤 Отправка данных для создания расписания:", scheduleData);

      const response = await makeRequest("/api/admin/age-schedules", {
        method: "POST",
        body: JSON.stringify(scheduleData),
      });

      console.log("📥 Ответ при создании расписания:", response);

      if (response.success && response.schedule) {
        const branch = branches.find(
          (b) => b.id === parseInt(scheduleForm.branchId),
        );

        const dayDisplayNames = dayNumbers.map(
          (dayNum) => weekDays[dayNum]?.short || "?",
        );

        const newSchedule = {
          id: response.schedule.id,
          ageGroup: scheduleForm.ageGroup,
          startTime: normalizedStartTime,
          endTime: normalizedEndTime,
          branchId: scheduleForm.branchId,
          days: scheduleForm.days,
          dayNumbers: dayNumbers,
          maxCapacity: scheduleForm.maxCapacity,
          instructor: scheduleForm.instructor || "",
          branchName: branch?.name || "Неизвестно",
          isActive: true,
          allDaysDisplay: dayDisplayNames.join(", "),
          time: normalizedStartTime,
        };

        setSchedules((prev) => [...prev, newSchedule]);
        showNotification(`Добавлено расписание на ${dayNumbers.length} дней`);
        resetScheduleForm();
        setShowAddScheduleModal(false);
        setEditingSchedule(null);
      } else {
        showNotification(
          response.error || "Ошибка создания расписания",
          "error",
        );
      }
    } catch (error) {
      console.error("Ошибка добавления расписания:", error);
      showNotification(
        `Ошибка добавления расписания: ${error.message}`,
        "error",
      );
    }
  };

  const handleEditSchedule = async () => {
    if (!editingSchedule) return;

    const normalizedStartTime = normalizeTime(scheduleForm.startTime);
    const normalizedEndTime = normalizeTime(scheduleForm.endTime);
    const isStartTimeValid = validateTime(normalizedStartTime);
    const isEndTimeValid = validateTime(normalizedEndTime);

    if (
      !scheduleForm.ageGroup ||
      !scheduleForm.branchId ||
      scheduleForm.days.length === 0 ||
      !isStartTimeValid ||
      !isEndTimeValid
    ) {
      showNotification("Заполните все обязательные поля корректно", "error");
      return;
    }

    const [startH, startM] = normalizedStartTime.split(":").map(Number);
    const [endH, endM] = normalizedEndTime.split(":").map(Number);

    if (endH * 60 + endM <= startH * 60 + startM) {
      showNotification(
        "Время окончания должно быть позже времени начала",
        "error",
      );
      return;
    }

    try {
      const dayNumbers = scheduleForm.days.map((dayId) =>
        getDayNumberFromId(dayId),
      );

      const scheduleData = {
        age_group: scheduleForm.ageGroup,
        days_of_week: dayNumbers,
        time: normalizedStartTime,
        end_time: normalizedEndTime,
        branch_id: parseInt(scheduleForm.branchId),
        capacity: scheduleForm.maxCapacity,
        instructor: scheduleForm.instructor || "",
        is_active: true,
      };

      console.log("📤 Отправка данных для обновления расписания:", {
        scheduleId: editingSchedule.id,
        data: scheduleData,
      });

      const response = await makeRequest(
        `/api/admin/age-schedules/${editingSchedule.id}`,
        {
          method: "PUT",
          body: JSON.stringify(scheduleData),
        },
      );

      console.log("📥 Ответ при обновлении расписания:", response);

      if (response.success) {
        const branch = branches.find(
          (b) => b.id === parseInt(scheduleForm.branchId),
        );

        const dayDisplayNames = dayNumbers.map(
          (dayNum) => weekDays[dayNum]?.short || "?",
        );

        const updatedSchedule = {
          ...editingSchedule,
          ageGroup: scheduleForm.ageGroup,
          startTime: normalizedStartTime,
          endTime: normalizedEndTime,
          branchId: scheduleForm.branchId,
          days: scheduleForm.days,
          dayNumbers: dayNumbers,
          maxCapacity: scheduleForm.maxCapacity,
          instructor: scheduleForm.instructor || "",
          branchName: branch?.name || "Неизвестно",
          allDaysDisplay: dayDisplayNames.join(", "),
        };

        setSchedules((prev) =>
          prev.map((s) => (s.id === editingSchedule.id ? updatedSchedule : s)),
        );
        showNotification("Расписание обновлено");
        resetScheduleForm();
        setShowAddScheduleModal(false);
        setEditingSchedule(null);
      } else {
        showNotification(
          response.error || "Ошибка обновления расписания",
          "error",
        );
      }
    } catch (error) {
      console.error("Ошибка обновления расписания:", error);
      showNotification(
        `Ошибка обновления расписания: ${error.message}`,
        "error",
      );
    }
  };

  const handleDeleteSchedule = async (scheduleId) => {
    openConfirmDialog({
      title: "Удалить расписание?",
      message:
        "Запись пропадет из календаря и из доступных слотов для детей этой возрастной группы.",
      confirmLabel: "Удалить",
      tone: "danger",
      onConfirm: async () => {
        try {
          const response = await makeRequest(
            `/api/admin/age-schedules/${scheduleId}`,
            {
              method: "DELETE",
            },
          );

          if (response.success) {
            setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
            showNotification("Расписание удалено");
          } else {
            showNotification(
              response.error || "Ошибка удаления расписания",
              "error",
            );
          }
        } catch (error) {
          console.error("Ошибка удаления расписания:", error);
          showNotification(
            `Ошибка удаления расписания: ${error.message}`,
            "error",
          );
        }
      },
    });
  };

  const resetScheduleForm = () => {
    setScheduleForm({
      ageGroup: "",
      startTime: "17:00",
      endTime: "18:00",
      branchId: "",
      days: [],
      maxCapacity: 15,
      instructor: "",
      isStartTimeManual: false,
      isEndTimeManual: false,
    });
  };

  const toggleDaySelection = (dayId) => {
    setScheduleForm((prev) => {
      const isSelected = prev.days.includes(dayId);
      if (isSelected) {
        return { ...prev, days: prev.days.filter((d) => d !== dayId) };
      } else {
        return { ...prev, days: [...prev.days, dayId] };
      }
    });
  };

  const getSelectedDaysLabels = () => {
    return scheduleForm.days
      .map((dayId) => {
        const day = weekDays.find((d) => d.id === dayId);
        return day ? day.short : dayId;
      })
      .join(", ");
  };

  // ========== ФУНКЦИИ ДЛЯ ФИЛИАЛОВ ==========

  const resetBranchForm = () => {
    setBranchForm(getEmptyBranchForm());
  };

  const closeAddBranchModal = () => {
    setShowAddBranchModal(false);
    resetBranchForm();
  };

  const closeEditBranchModal = () => {
    setShowEditBranchModal(false);
    resetBranchForm();
  };

  const handleBranchPhotoChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      showNotification("Можно загрузить только изображение", "error");
      return;
    }

    if (file.size > BRANCH_PHOTO_MAX_SIZE) {
      showNotification("Размер фото не должен превышать 5 МБ", "error");
      return;
    }

    try {
      const photoData = await readFileAsDataUrl(file);
      setBranchForm((prev) => ({ ...prev, photoData }));
    } catch (error) {
      console.error("Ошибка загрузки фото филиала:", error);
      showNotification("Не удалось загрузить фото", "error");
    }
  };

  const handleEditBranch = (branch) => {
    setBranchForm({
      id: branch.id,
      name: branch.name,
      address: branch.address,
      phone: branch.phone || "",
      email: branch.email || "",
      photoData: branch.photoData || null,
      status: branch.status,
    });
    setShowEditBranchModal(true);
  };

  const handleSaveBranch = async () => {
    if (!branchForm.name || !branchForm.address) {
      showNotification("Заполните обязательные поля", "error");
      return;
    }

    try {
      if (branchForm.id) {
        const response = await makeRequest(
          `/api/admin/branches/${branchForm.id}`,
          {
            method: "PUT",
            body: JSON.stringify({
              name: branchForm.name,
              address: branchForm.address,
              phone: branchForm.phone,
              email: branchForm.email,
              photo_data: branchForm.photoData,
              is_active: branchForm.status === "active",
            }),
          },
        );

        if (response.success) {
          const updatedBranch = response.branch
            ? mapBranchFromApi(response.branch)
            : {
                id: branchForm.id,
                name: branchForm.name,
                address: branchForm.address,
                phone: branchForm.phone,
                email: branchForm.email,
                photoData: branchForm.photoData,
                status: branchForm.status,
                capacity: 30,
                schedules: 0,
              };

          setBranches((prev) =>
            prev.map((b) =>
              b.id === branchForm.id ? { ...b, ...updatedBranch } : b,
            ),
          );
          showNotification("Филиал обновлен");
          closeEditBranchModal();
        }
      } else {
        const response = await makeRequest("/api/admin/branches", {
          method: "POST",
          body: JSON.stringify({
            name: branchForm.name,
            address: branchForm.address,
            phone: branchForm.phone,
            email: branchForm.email,
            photo_data: branchForm.photoData,
            is_active: branchForm.status === "active",
          }),
        });

        if (response.success) {
          const newBranch = response.branch
            ? mapBranchFromApi(response.branch)
            : {
                id: Date.now(),
                name: branchForm.name,
                address: branchForm.address,
                phone: branchForm.phone,
                email: branchForm.email,
                photoData: branchForm.photoData,
                status: branchForm.status,
                capacity: 30,
                schedules: 0,
              };
          setBranches((prev) => [...prev, newBranch]);
          showNotification("Филиал добавлен");
          closeAddBranchModal();
        }
      }
    } catch (error) {
      console.error("Ошибка сохранения филиала:", error);
      showNotification("Ошибка сохранения филиала", "error");
    }
  };

  const handleDeleteBranch = async (branchId) => {
    try {
      const checkResponse = await makeRequest(
        `/api/admin/branches/${branchId}/dependencies`,
      );

      if (checkResponse.success) {
        const { dependencies, summary } = checkResponse;
        const totalDeps = summary.total_dependencies;

        if (totalDeps > 0) {
          let message = `Нельзя удалить филиал. Есть связанные данные:\n`;
          message += `• Расписания: ${dependencies.schedules.count}\n`;
          message += `• Заявки: ${dependencies.applications.count}\n`;
          message += `• Платежи: ${dependencies.payments.count}\n`;
          message += `• Посещения: ${dependencies.attendance.count}\n\n`;
          message += `Хотите принудительно удалить филиал со всеми данными?`;

          openConfirmDialog({
            title: "Удалить филиал со всеми связанными данными?",
            message,
            confirmLabel: "Удалить принудительно",
            tone: "danger",
            onConfirm: async () => {
              const forceResponse = await makeRequest(
                `/api/admin/branches/${branchId}/force`,
                {
                  method: "DELETE",
                },
              );

              if (forceResponse.success) {
                showNotification("Филиал и связанные данные удалены");
                await loadAllData();
              } else {
                showNotification(
                  forceResponse.error || "Ошибка удаления",
                  "error",
                );
              }
            },
          });
        } else {
          openConfirmDialog({
            title: "Удалить филиал?",
            message:
              "Филиал исчезнет из публичной части сайта и из дальнейшего назначения детям.",
            confirmLabel: "Удалить",
            tone: "danger",
            onConfirm: async () => {
              const response = await makeRequest(
                `/api/admin/branches/${branchId}`,
                {
                  method: "DELETE",
                },
              );

              if (response.success) {
                showNotification("Филиал удален");
                await loadAllData();
              } else {
                showNotification(response.error || "Ошибка удаления", "error");
              }
            },
          });
        }
      }
    } catch (error) {
      console.error("Ошибка удаления филиала:", error);
      showNotification("Ошибка удаления филиала", "error");
    }
  };

  const handleDeleteUser = async (userId, userName) => {
    try {
      const checkResponse = await makeRequest(
        `/api/admin/users/${userId}/dependencies`,
      );

      if (checkResponse.success) {
        const { dependencies, summary } = checkResponse;
        const totalDeps = summary.total_dependencies;

        if (totalDeps > 0) {
          let message = `Нельзя удалить пользователя "${userName}". Есть связанные данные:\n`;
          message += `• Платежи: ${dependencies.payments?.count || 0}\n`;
          message += `• Посещения: ${dependencies.attendance?.count || 0}\n`;
          message += `• Заявки: ${dependencies.applications?.count || 0}\n\n`;
          message += `Хотите принудительно удалить пользователя со всеми данными?`;

          openConfirmDialog({
            title: `Удалить пользователя "${userName}" со всеми данными?`,
            message,
            confirmLabel: "Удалить принудительно",
            tone: "danger",
            onConfirm: async () => {
              const forceResponse = await makeRequest(
                `/api/admin/users/${userId}/force`,
                {
                  method: "DELETE",
                },
              );

              if (forceResponse.success) {
                showNotification(
                  `Пользователь "${userName}" и связанные данные удалены`,
                );
                setUsers((prev) => prev.filter((u) => u.id !== userId));
              } else {
                showNotification(
                  forceResponse.error || "Ошибка удаления",
                  "error",
                );
              }
            },
          });
          return;
        } else {
          openConfirmDialog({
            title: `Удалить пользователя "${userName}"?`,
            message:
              "Карточка родителя и его дети исчезнут из текущего списка. Отменить это после удаления уже нельзя.",
            confirmLabel: "Удалить",
            tone: "danger",
            onConfirm: async () => {
              const response = await makeRequest(`/api/admin/users/${userId}`, {
                method: "DELETE",
              });

              if (response.success) {
                showNotification(`Пользователь "${userName}" удален`);
                setUsers((prev) => prev.filter((u) => u.id !== userId));
              } else {
                showNotification(response.error || "Ошибка удаления", "error");
              }
            },
          });
          return;
        }
      }
    } catch (error) {
      console.error("Ошибка удаления пользователя:", error);
      openConfirmDialog({
        title: `Удалить пользователя "${userName}"?`,
        message:
          "Не удалось проверить зависимости автоматически. При подтверждении пользователь и все связанные записи будут удалены принудительно.",
        confirmLabel: "Удалить принудительно",
        tone: "danger",
        onConfirm: async () => {
          try {
            const response = await makeRequest(
              `/api/admin/users/${userId}/force`,
              {
                method: "DELETE",
              },
            );

            if (response.success) {
              showNotification(`Пользователь "${userName}" удален`);
              setUsers((prev) => prev.filter((u) => u.id !== userId));
            }
          } catch (err) {
            showNotification("Ошибка удаления пользователя", "error");
          }
        },
      });
    }
  };

  // ========== ФУНКЦИИ ДЛЯ КАЛЕНДАРЯ ==========

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const days = [];
    let startingDay = (firstDay.getDay() + 6) % 7;

    for (let i = 0; i < startingDay; i++) {
      days.push(null);
    }

    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }

    return days;
  };

  const formatDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const resolveCalendarFilters = (overrides = {}) => ({
    ageGroup: overrides.ageGroup ?? selectedAgeGroup,
    branchId: overrides.branchId ?? selectedBranchFilter,
  });

  const loadCalendarMonth = async (
    targetMonth = currentMonth,
    overrides = {},
  ) => {
    const { ageGroup, branchId } = resolveCalendarFilters(overrides);
    const year = targetMonth.getFullYear();
    const month = targetMonth.getMonth() + 1;

    let url = `/api/admin/attendance/calendar/month?year=${year}&month=${month}`;
    if (ageGroup !== "all") {
      url += `&age_group=${ageGroup}`;
    }
    if (branchId !== "all") {
      url += `&branch_id=${branchId}`;
    }

    const response = await makeRequest(url);
    if (!response.success || !Array.isArray(response.calendar)) {
      setCalendarSessionsByDate({});
      return;
    }

    const nextSessions = {};
    response.calendar.forEach((calendarDay) => {
      const sessionsMap = new Map();

      (calendarDay.attendance || []).forEach((attendance) => {
        const sessionKey =
          attendance.schedule_id ||
          `${attendance.time}-${attendance.age_group}-${attendance.branch_id || "branch"}`;

        if (!sessionsMap.has(sessionKey)) {
          sessionsMap.set(sessionKey, {
            ageGroup: attendance.age_group,
            branchName: attendance.branch_name,
            endTime: attendance.time,
            instructor: attendance.branch_name,
            startTime: attendance.time,
          });
        }
      });

      nextSessions[calendarDay.date] = Array.from(sessionsMap.values());
    });

    setCalendarSessionsByDate(nextSessions);
  };

  const handlePrevMonth = async () => {
    const prevMonth = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() - 1,
      1,
    );
    setCurrentMonth(prevMonth);
    await loadCalendarMonth(prevMonth);
  };

  const handleNextMonth = async () => {
    const nextMonth = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + 1,
      1,
    );
    setCurrentMonth(nextMonth);
    await loadCalendarMonth(nextMonth);
  };

  const handleAgeGroupFilterChange = async (value) => {
    setSelectedAgeGroup(value);
    await loadCalendarMonth(currentMonth, { ageGroup: value });
    if (selectedDate && dayDetails) {
      await handleDateClick(selectedDate, {
        silent: true,
        filters: { ageGroup: value },
      });
    }
  };

  const handleBranchFilterChange = async (value) => {
    setSelectedBranchFilter(value);
    await loadCalendarMonth(currentMonth, { branchId: value });
    if (selectedDate && dayDetails) {
      await handleDateClick(selectedDate, {
        silent: true,
        filters: { branchId: value },
      });
    }
  };

  const formatDate = (date) => {
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      weekday: "long",
    });
  };

  const handleDateClick = async (date, options = {}) => {
    const { silent = false, filters = {} } = options;
    setSelectedDate(date);
    setDayDetails(null);

    try {
      const dateStr = formatDateKey(date);
      const { ageGroup, branchId } = resolveCalendarFilters(filters);

      console.log("🟢 handleDateClick вызван:", {
        originalDate: date,
        localDate: date.toLocaleDateString("ru-RU"),
        jsDay: date.getDay(),
        dayName: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][date.getDay()],
        formattedDate: dateStr,
      });

      let url = `/api/admin/attendance/calendar/day?date=${dateStr}`;
      if (ageGroup !== "all") {
        url += `&age_group=${ageGroup}`;
      }
      if (branchId !== "all") {
        url += `&branch_id=${branchId}`;
      }

      console.log("📤 Запрос URL:", url);

      const response = await makeRequest(url);
      console.log("📥 Ответ от сервера:", response);

      if (response.success) {
        const groupedAttendance = {};

        if (response.schedule && Array.isArray(response.schedule)) {
          response.schedule.forEach((timeSlot) => {
            if (timeSlot.time && timeSlot.records) {
              groupedAttendance[timeSlot.time] = timeSlot.records;
            }
          });
        }

        console.log("📊 Преобразованные данные:", {
          totalRecords: response.total_records,
          scheduleLength: response.schedule?.length || 0,
          groupedAttendanceKeys: Object.keys(groupedAttendance),
          sampleRecord:
            groupedAttendance[Object.keys(groupedAttendance)[0]]?.[0],
        });

        setDayDetails({
          date: response.date,
          date_display: response.date_display || formatDate(date),
          day_name:
            response.day_name ||
            date.toLocaleDateString("ru-RU", { weekday: "long" }),
          total_children: response.total_records || 0,
          grouped_attendance: groupedAttendance,
        });

        if (!silent) {
          showNotification(
            `Загружено ${response.total_records || 0} детей на ${
              response.date_display || dateStr
            }`,
          );
        }
      } else {
        console.warn("⚠️ Ответ success=false:", response);
        setDayDetails({
          date: dateStr,
          date_display: formatDate(date),
          day_name: date.toLocaleDateString("ru-RU", { weekday: "long" }),
          total_children: 0,
          grouped_attendance: {},
        });
        if (!silent) {
          showNotification(
            response.error || "Нет посещений на этот день",
            "info",
          );
        }
      }
    } catch (error) {
      console.error("🔴 Ошибка загрузки деталей дня:", error);
      setDayDetails({
        date: date.toISOString().split("T")[0],
        date_display: formatDate(date),
        day_name: date.toLocaleDateString("ru-RU", { weekday: "long" }),
        total_children: 0,
        grouped_attendance: {},
      });
      showNotification("Ошибка загрузки данных посещений", "warning");
    }
  };

  // ========== ФУНКЦИИ ДЛЯ ОТМЕТКИ ПОСЕЩЕНИЙ ==========

  const getStatusText = (status) => {
    const statusTexts = {
      attended: "Присутствовал",
      missed: "Отсутствовал",
      scheduled: "Запланировано",
      cancelled: "Отменено",
      rescheduled: "Перенесено",
    };
    return statusTexts[status] || status;
  };

  const getStatusColor = (status) => {
    const statusColors = {
      attended: "success",
      missed: "error",
      scheduled: "warning",
      cancelled: "secondary",
      rescheduled: "secondary",
    };
    return statusColors[status] || "default";
  };

  const handleMarkAttendance = async (attendanceId, status, childName) => {
    try {
      const response = await makeRequest(
        `/api/admin/attendance/${attendanceId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            status,
            notes: `Статус изменен администратором`,
          }),
        },
      );

      if (response.success) {
        showNotification(`✅ ${childName}: ${getStatusText(status)}`);

        if (selectedDate && dayDetails) {
          await handleDateClick(selectedDate, { silent: true });
        }

        return true;
      }
    } catch (error) {
      console.error("Ошибка отметки посещения:", error);
      showNotification(
        error.message || `❌ Ошибка отметки посещения для ${childName}`,
        "error",
      );
      return false;
    }
  };

  const handleBulkMarkAttendance = async (attendanceIds, status) => {
    if (attendanceIds.length === 0) {
      showNotification("Выберите записи для отметки", "warning");
      return;
    }

    try {
      const response = await makeRequest("/api/admin/attendance/bulk-mark", {
        method: "POST",
        body: JSON.stringify({
          attendance_ids: attendanceIds,
          status,
          notes: "Массовая отметка администратором",
        }),
      });

      if (response.success) {
        showNotification(
          `✅ Отмечено ${response.updated_count} записей как "${getStatusText(
            status,
          )}"`,
        );

        if (selectedDate) {
          await handleDateClick(selectedDate, { silent: true });
        }
      }
    } catch (error) {
      console.error("Ошибка массовой отметки:", error);
      showNotification(error.message || "❌ Ошибка массовой отметки", "error");
    }
  };

  // ========== ФУНКЦИИ ДЛЯ ПОЛЬЗОВАТЕЛЕЙ ==========

  const resetUserForm = () => {
    setUserForm(getEmptyUserForm());
    setEditingUser(null);
  };

  const closeUserModal = () => {
    setShowUserModal(false);
    resetUserForm();
  };

  const handleCreateUser = () => {
    resetUserForm();
    setShowUserModal(true);
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setUserForm({
      id: user.id,
      name: user.name || "",
      email: user.email || "",
      phone: user.phone || "",
      password: "",
      children:
        user.children?.length > 0
          ? user.children.map((child) => ({
              id: child.id,
              name: child.name || "",
              birth_year: child.birth_year || "",
              branch_id: child.branch_id?.toString() || "",
              branch_name: child.branch_name || "",
            }))
          : [getEmptyUserChild()],
    });
    setShowUserModal(true);
  };

  const handleUserFieldChange = (field, value) => {
    setUserForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleChildFieldChange = (childId, field, value) => {
    setUserForm((prev) => ({
      ...prev,
      children: prev.children.map((child) =>
        child.id === childId
          ? {
              ...child,
              [field]: value,
            }
          : child,
      ),
    }));
  };

  const handleAddChildRow = () => {
    setUserForm((prev) => ({
      ...prev,
      children: [...prev.children, getEmptyUserChild()],
    }));
  };

  const handleRemoveChildRow = (childId) => {
    setUserForm((prev) => {
      const nextChildren = prev.children.filter(
        (child) => child.id !== childId,
      );
      return {
        ...prev,
        children:
          nextChildren.length > 0 ? nextChildren : [getEmptyUserChild()],
      };
    });
  };

  const handleSaveUser = async () => {
    const children = userForm.children
      .map((child) => ({
        id: typeof child.id === "number" ? child.id : undefined,
        name: child.name?.trim() || "",
        birth_year: child.birth_year ? Number(child.birth_year) : "",
        branch_id: child.branch_id ? Number(child.branch_id) : "",
      }))
      .filter((child) => child.name || child.birth_year || child.branch_id);

    if (!userForm.name.trim() || !userForm.email.trim()) {
      showNotification("Заполните имя и email", "error");
      return;
    }

    if (!editingUser && !userForm.password.trim()) {
      showNotification("Укажите пароль для нового пользователя", "error");
      return;
    }

    if (children.some((child) => !child.name || !child.birth_year)) {
      showNotification(
        "Для каждого ребенка укажите имя и год рождения",
        "error",
      );
      return;
    }

    setSavingUser(true);
    try {
      const payload = {
        name: userForm.name.trim(),
        email: userForm.email.trim(),
        phone: userForm.phone.trim(),
        children,
      };

      if (userForm.password.trim()) {
        payload.password = userForm.password.trim();
      }

      const endpoint = editingUser
        ? `/api/admin/users/${editingUser.id}`
        : "/api/admin/users";
      const method = editingUser ? "PUT" : "POST";

      const response = await makeRequest(endpoint, {
        method,
        body: JSON.stringify(payload),
      });

      if (!response.success) {
        throw new Error(response.error || "Не удалось сохранить пользователя");
      }

      await loadAllData();
      showNotification(
        editingUser ? "Пользователь обновлен" : "Пользователь добавлен",
      );
      closeUserModal();
    } catch (error) {
      showNotification(error.message || "Ошибка сохранения", "error");
    } finally {
      setSavingUser(false);
    }
  };

  const handleContactFieldChange = (field, value) => {
    setSiteContent((prev) => ({
      ...prev,
      contactInfo: {
        ...prev.contactInfo,
        [field]: value,
      },
    }));
  };

  const closePaymentPlanModal = useCallback(() => {
    setShowPaymentPlanModal(false);
    setEditingPaymentPlanIndex(null);
    setPaymentPlanForm(getEmptyPaymentPlan());
  }, []);

  const openPaymentPlanModal = useCallback(
    (index = null) => {
      if (typeof index === "number" && siteContent.paymentPlans[index]) {
        setEditingPaymentPlanIndex(index);
        setPaymentPlanForm(
          normalizePaymentPlanContent(siteContent.paymentPlans[index]),
        );
      } else {
        setEditingPaymentPlanIndex(null);
        setPaymentPlanForm(getEmptyPaymentPlan());
      }

      setShowPaymentPlanModal(true);
    },
    [siteContent.paymentPlans],
  );

  const handlePaymentPlanFormFieldChange = (field, value) => {
    setPaymentPlanForm((prev) => ({
      ...prev,
      [field]:
        field === "trainings" || field === "price"
          ? value.replace(/[^\d]/g, "")
          : value,
    }));
  };

  const handlePaymentPlanFieldChange = (planId, field, value) => {
    setSiteContent((prev) => ({
      ...prev,
      paymentPlans: prev.paymentPlans.map((plan) =>
        String(plan.id) === String(planId)
          ? {
              ...plan,
              [field]:
                field === "trainings" || field === "price"
                  ? value.replace(/[^\d]/g, "")
                  : value,
            }
          : plan,
      ),
    }));
  };

  const handleAddPaymentPlan = () => {
    openPaymentPlanModal();
  };

  const handleSavePaymentPlan = () => {
    const normalizedPlan = normalizePaymentPlanContent(
      paymentPlanForm,
      paymentPlanForm.id,
    );

    if (!hasPaymentPlanContent(normalizedPlan)) {
      showNotification(
        "Заполните хотя бы название, количество тренировок, стоимость или описание тарифа",
        "warning",
      );
      return;
    }

    setSiteContent((prev) => {
      const nextPlans = prev.paymentPlans.map((plan, index) =>
        normalizePaymentPlanContent(plan, `payment-plan-${index + 1}`),
      );

      if (
        typeof editingPaymentPlanIndex === "number" &&
        nextPlans[editingPaymentPlanIndex]
      ) {
        nextPlans[editingPaymentPlanIndex] = normalizedPlan;
      } else {
        nextPlans.push(normalizedPlan);
      }

      return {
        ...prev,
        paymentPlans: nextPlans.filter(hasPaymentPlanContent),
      };
    });

    showNotification(
      typeof editingPaymentPlanIndex === "number"
        ? "Тариф обновлён"
        : "Тариф добавлен",
    );
    closePaymentPlanModal();
  };

  const handleRemovePaymentPlan = (indexOrId) => {
    const resolvedIndex =
      typeof indexOrId === "number"
        ? indexOrId
        : siteContent.paymentPlans.findIndex(
            (plan) => String(plan.id) === String(indexOrId),
          );

    if (resolvedIndex < 0) {
      return;
    }

    openConfirmDialog({
      title: "Удалить тариф?",
      message: "Тариф исчезнет из настроек и больше не будет доступен при создании оплаты.",
      confirmLabel: "Удалить",
      cancelLabel: "Отмена",
      tone: "danger",
      onConfirm: async () => {
        setSiteContent((prev) => ({
          ...prev,
          paymentPlans: prev.paymentPlans
            .filter((_, planIndex) => planIndex !== resolvedIndex)
            .filter(hasPaymentPlanContent),
        }));

        if (editingPaymentPlanIndex === resolvedIndex) {
          closePaymentPlanModal();
        }

        showNotification("Тариф удалён");
      },
    });
  };

  const handleTrainerFieldChange = (index, field, value) => {
    setSiteContent((prev) => ({
      ...prev,
      trainers: prev.trainers.map((trainer, trainerIndex) =>
        trainerIndex === index
          ? {
              ...trainer,
              [field]: value,
            }
          : trainer,
      ),
    }));
  };

  const closeTrainerModal = useCallback(() => {
    setShowTrainerModal(false);
    setEditingTrainerIndex(null);
    setTrainerForm(getEmptyTrainer());
  }, []);

  const openTrainerModal = useCallback(
    (index = null) => {
      if (typeof index === "number" && siteContent.trainers[index]) {
        setEditingTrainerIndex(index);
        setTrainerForm(normalizeTrainerContent(siteContent.trainers[index]));
      } else {
        setEditingTrainerIndex(null);
        setTrainerForm(getEmptyTrainer());
      }

      setShowTrainerModal(true);
    },
    [siteContent.trainers],
  );

  const handleTrainerFormFieldChange = (field, value) => {
    setTrainerForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleTrainerPhotoChange = async (indexOrFile, maybeFile) => {
    const isLegacyMode = typeof indexOrFile === "number";
    const legacyIndex = isLegacyMode ? indexOrFile : null;
    const file = isLegacyMode ? maybeFile : indexOrFile;
    if (!file) {
      return;
    }

    if (file.size > BRANCH_PHOTO_MAX_SIZE) {
      showNotification("Размер фото не должен превышать 5 МБ", "error");
      return;
    }

    try {
      const photoData = await readFileAsDataUrl(file);
      if (isLegacyMode && legacyIndex !== null) {
        handleTrainerFieldChange(legacyIndex, "photo_data", photoData);
      } else {
        handleTrainerFormFieldChange("photo_data", photoData);
      }
    } catch (error) {
      console.error("Ошибка загрузки фото тренера:", error);
      showNotification("Не удалось загрузить фото тренера", "error");
    }
  };

  const handleAddTrainer = () => {
    openTrainerModal();
  };

  const handleSaveTrainer = () => {
    const normalizedTrainer = normalizeTrainerContent(trainerForm);

    if (!hasTrainerContent(normalizedTrainer)) {
      showNotification(
        "Заполните хотя бы имя, роль, описание или фото",
        "warning",
      );
      return;
    }

    setSiteContent((prev) => {
      const nextTrainers = prev.trainers.map(normalizeTrainerContent);

      if (
        typeof editingTrainerIndex === "number" &&
        nextTrainers[editingTrainerIndex]
      ) {
        nextTrainers[editingTrainerIndex] = normalizedTrainer;
      } else {
        nextTrainers.push(normalizedTrainer);
      }

      return {
        ...prev,
        trainers: nextTrainers.filter(hasTrainerContent),
      };
    });

    showNotification(
      typeof editingTrainerIndex === "number"
        ? "Карточка тренера обновлена"
        : "Тренер добавлен",
    );
    closeTrainerModal();
  };

  const handleRemoveTrainer = (index) => {
    openConfirmDialog({
      title: "Удалить тренера?",
      message: "Карточка тренера будет удалена из настроек сайта.",
      confirmLabel: "Удалить",
      cancelLabel: "Отмена",
      tone: "danger",
      onConfirm: async () => {
        setSiteContent((prev) => ({
          ...prev,
          trainers: prev.trainers
            .filter((_, trainerIndex) => trainerIndex !== index)
            .filter(hasTrainerContent),
        }));

        if (editingTrainerIndex === index) {
          closeTrainerModal();
        }

        showNotification("Тренер удалён");
      },
    });
  };

  const handleAchievementsMetaChange = (field, value) => {
    setSiteContent((prev) => ({
      ...prev,
      achievements: {
        ...prev.achievements,
        [field]: value,
      },
    }));
  };

  const handleAchievementFieldChange = (index, field, value) => {
    setSiteContent((prev) => ({
      ...prev,
      achievements: {
        ...prev.achievements,
        items: prev.achievements.items.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                [field]: value,
              }
            : item,
        ),
      },
    }));
  };

  const handleAddAchievement = () => {
    setSiteContent((prev) => ({
      ...prev,
      achievements: {
        ...prev.achievements,
        items: [...prev.achievements.items, getEmptyAchievementItem()],
      },
    }));
  };

  const handleRemoveAchievement = (index) => {
    setSiteContent((prev) => {
      const nextItems = prev.achievements.items.filter(
        (_, itemIndex) => itemIndex !== index,
      );

      return {
        ...prev,
        achievements: {
          ...prev.achievements,
          items: nextItems.length > 0 ? nextItems : [getEmptyAchievementItem()],
        },
      };
    });
  };

  const handleAchievementNewsFieldChange = (index, field, value) => {
    setSiteContent((prev) => ({
      ...prev,
      achievements: {
        ...prev.achievements,
        news: prev.achievements.news.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                [field]: value,
              }
            : item,
        ),
      },
    }));
  };

  const handleAddAchievementNews = () => {
    setSiteContent((prev) => ({
      ...prev,
      achievements: {
        ...prev.achievements,
        news: [...prev.achievements.news, getEmptyAchievementNewsItem()],
      },
    }));
  };

  const handleRemoveAchievementNews = (index) => {
    setSiteContent((prev) => {
      const nextNews = prev.achievements.news.filter(
        (_, itemIndex) => itemIndex !== index,
      );

      return {
        ...prev,
        achievements: {
          ...prev.achievements,
          news:
            nextNews.length > 0 ? nextNews : [getEmptyAchievementNewsItem()],
        },
      };
    });
  };

  const handleAdministrationFieldChange = () => {};

  const handleAdministrationPhotoChange = () => {};

  const handleAddAdministrationMember = () => {};

  const handleRemoveAdministrationMember = () => {};

  const handleDownloadReport = async () => {
    const token = getAdminToken();
    if (!token) {
      checkAuth();
      return;
    }

    setDownloadingReport(true);
    try {
      const response = await fetch("/api/admin/reports/summary.xlsx", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        const responseType = response.headers.get("content-type") || "";

        try {
          if (responseType.includes("application/json")) {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          } else {
            const errorText = await response.text();
            if (errorText) {
              errorMessage = errorText;
            }
          }
        } catch (parseError) {
          console.warn("Не удалось прочитать ответ выгрузки:", parseError);
        }

        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem("adminToken");
          showNotification(
            "Сессия истекла. Пожалуйста, войдите снова",
            "error",
          );
          setTimeout(() => {
            window.location.href = "/admin/login";
          }, 1500);
          throw new Error("Unauthorized");
        }

        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const fallbackName = `dneprovets-admin-summary-${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx`;
      const filename = getDownloadFilename(
        response.headers.get("content-disposition"),
        fallbackName,
      );
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);

      showNotification("Сводный Excel-файл скачан");
    } catch (error) {
      if (error.message !== "Unauthorized") {
        showNotification(
          error.message || "Не удалось скачать сводный файл",
          "error",
        );
      }
    } finally {
      setDownloadingReport(false);
    }
  };

  const handleSaveSiteContent = async () => {
    setSavingSiteContent(true);
    try {
      const preparedPaymentPlans = siteContent.paymentPlans
        .filter(hasPaymentPlanContent)
        .map((plan) => ({
          id: String(plan.id || "").trim(),
          name: String(plan.name || "").trim(),
          trainings: Number.parseInt(plan.trainings, 10),
          price: Number.parseInt(plan.price, 10),
          description: String(plan.description || "").trim(),
        }));

      if (preparedPaymentPlans.length === 0) {
        throw new Error("Добавьте хотя бы один тариф тренировок");
      }

      const payload = {
        contact_info: siteContent.contactInfo,
        payment_plans: preparedPaymentPlans,
        trainers: siteContent.trainers.filter(hasTrainerContent),
        achievements: {
          title: siteContent.achievements.title,
          intro: siteContent.achievements.intro,
          items: siteContent.achievements.items.filter(
            (item) =>
              item.value?.trim() ||
              item.title?.trim() ||
              item.description?.trim(),
          ),
          news: siteContent.achievements.news.filter(
            (item) =>
              item.title?.trim() ||
              item.date?.trim() ||
              item.tag?.trim() ||
              item.summary?.trim() ||
              item.content?.trim(),
          ),
        },
      };

      const response = await makeRequest("/api/admin/site-content", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      if (!response.success) {
        throw new Error(response.error || "Не удалось сохранить контент");
      }

      setSiteContent({
        contactInfo:
          response.contact_info || getDefaultSiteContent().contactInfo,
        paymentPlans: normalizePaymentPlansContent(response.payment_plans),
        trainers:
          response.trainers?.length > 0
            ? response.trainers.map(normalizeTrainerContent)
            : getDefaultSiteContent().trainers,
        achievements: normalizeAchievementsContent(response.achievements),
      });
      showNotification("Контент сайта обновлён");
    } catch (error) {
      showNotification(error.message || "Ошибка сохранения", "error");
    } finally {
      setSavingSiteContent(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLowerCase();

    if (!normalizedQuery) {
      return users;
    }

    return users.filter(
      (user) =>
        user.name?.toLowerCase().includes(normalizedQuery) ||
        user.email?.toLowerCase().includes(normalizedQuery) ||
        user.phone?.includes(searchTerm) ||
        user.children?.some((child) =>
          child.name?.toLowerCase().includes(normalizedQuery),
        ),
    );
  }, [searchTerm, users]);

  // ========== ФУНКЦИИ ДЛЯ ОПЛАТ ==========

  const filteredPayments = useMemo(() => {
    const normalizedQuery = paymentSearchTerm.trim().toLowerCase();

    return payments.filter((payment) => {
      if (
        paymentFilters.status !== "all" &&
        payment.status !== paymentFilters.status
      ) {
        return false;
      }
      if (
        paymentFilters.userId !== "all" &&
        payment.user_id !== parseInt(paymentFilters.userId)
      ) {
        return false;
      }
      if (
        paymentFilters.branchId !== "all" &&
        payment.branch_id !== parseInt(paymentFilters.branchId)
      ) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }

      return [
        payment.id,
        payment.user_name,
        payment.child_name,
        payment.branch_name,
        payment.amount,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    });
  }, [paymentFilters, paymentSearchTerm, payments]);

  const sortedUsers = useMemo(() => {
    const items = [...filteredUsers];
    const multiplier = userSort.direction === "asc" ? 1 : -1;

    items.sort((left, right) => {
      if (userSort.field === "children_count") {
        return (
          ((left.children?.length || 0) - (right.children?.length || 0)) *
          multiplier
        );
      }

      const leftValue =
        userSort.field === "registered_at"
          ? new Date(left.registered_at || 0).getTime()
          : String(left[userSort.field] || "").toLowerCase();
      const rightValue =
        userSort.field === "registered_at"
          ? new Date(right.registered_at || 0).getTime()
          : String(right[userSort.field] || "").toLowerCase();

      if (leftValue < rightValue) return -1 * multiplier;
      if (leftValue > rightValue) return 1 * multiplier;
      return 0;
    });

    return items;
  }, [filteredUsers, userSort]);

  const sortedPayments = useMemo(() => {
    const items = [...filteredPayments];
    const multiplier = paymentSort.direction === "asc" ? 1 : -1;

    items.sort((left, right) => {
      const numericFields = [
        "id",
        "amount",
        "training_count",
        "used_trainings",
        "remaining_trainings",
      ];
      const dateFields = ["created_at"];

      const leftValue = numericFields.includes(paymentSort.field)
        ? Number(left[paymentSort.field] || 0)
        : dateFields.includes(paymentSort.field)
          ? new Date(left[paymentSort.field] || 0).getTime()
          : String(left[paymentSort.field] || "").toLowerCase();
      const rightValue = numericFields.includes(paymentSort.field)
        ? Number(right[paymentSort.field] || 0)
        : dateFields.includes(paymentSort.field)
          ? new Date(right[paymentSort.field] || 0).getTime()
          : String(right[paymentSort.field] || "").toLowerCase();

      if (leftValue < rightValue) return -1 * multiplier;
      if (leftValue > rightValue) return 1 * multiplier;
      return 0;
    });

    return items;
  }, [filteredPayments, paymentSort]);

  const usersTotalPages = Math.max(
    1,
    Math.ceil(sortedUsers.length / USERS_PER_PAGE),
  );
  const paymentsTotalPages = Math.max(
    1,
    Math.ceil(sortedPayments.length / PAYMENTS_PER_PAGE),
  );

  const paginatedUsers = useMemo(() => {
    const startIndex = (usersPage - 1) * USERS_PER_PAGE;
    return sortedUsers.slice(startIndex, startIndex + USERS_PER_PAGE);
  }, [sortedUsers, usersPage]);

  const paginatedPayments = useMemo(() => {
    const startIndex = (paymentsPage - 1) * PAYMENTS_PER_PAGE;
    return sortedPayments.slice(startIndex, startIndex + PAYMENTS_PER_PAGE);
  }, [sortedPayments, paymentsPage]);

  useEffect(() => {
    setUsersPage(1);
  }, [searchTerm, userSort]);

  useEffect(() => {
    if (usersPage > usersTotalPages) {
      setUsersPage(usersTotalPages);
    }
  }, [usersPage, usersTotalPages]);

  useEffect(() => {
    setPaymentsPage(1);
  }, [paymentFilters, paymentSearchTerm, paymentSort]);

  useEffect(() => {
    if (paymentsPage > paymentsTotalPages) {
      setPaymentsPage(paymentsTotalPages);
    }
  }, [paymentsPage, paymentsTotalPages]);

  const handleUserSortChange = useCallback((field) => {
    setUserSort((prev) => ({
      field,
      direction:
        prev.field === field && prev.direction === "asc" ? "desc" : "asc",
    }));
  }, []);

  const handlePaymentSortChange = useCallback((field) => {
    setPaymentSort((prev) => ({
      field,
      direction:
        prev.field === field && prev.direction === "asc" ? "desc" : "asc",
    }));
  }, []);

  const renderSortButton = useCallback((label, isActive, direction) => {
    return (
      <span className={`sort-pill ${isActive ? "active" : ""}`}>
        {label}
        <ChevronDown
          size={14}
          className={isActive && direction === "asc" ? "rotated" : ""}
        />
      </span>
    );
  }, []);

  const renderPagination = useCallback(
    ({ page, totalPages, onChange, totalItems, pageSize }) => {
      if (totalItems <= pageSize) {
        return null;
      }

      const startItem = (page - 1) * pageSize + 1;
      const endItem = Math.min(totalItems, page * pageSize);

      return (
        <div className="list-pagination">
          <div className="list-pagination-summary">
            Показаны {startItem}-{endItem} из {totalItems}
          </div>
          <div className="list-pagination-actions">
            <button
              type="button"
              className="secondary-btn pagination-btn"
              onClick={() => onChange(Math.max(1, page - 1))}
              disabled={page <= 1}
            >
              Назад
            </button>
            <span className="pagination-page-indicator">
              Страница {page} из {totalPages}
            </span>
            <button
              type="button"
              className="secondary-btn pagination-btn"
              onClick={() => onChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
            >
              Вперед
            </button>
          </div>
        </div>
      );
    },
    [],
  );

  const handleUpdatePaymentStatus = async (paymentId, newStatus) => {
    try {
      const response = await makeRequest(`/api/admin/payments/${paymentId}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.success) {
        setPayments((prev) =>
          prev.map((p) =>
            p.id === paymentId
              ? {
                  ...p,
                  status: response.payment?.status || newStatus,
                  remaining_trainings:
                    response.payment?.remaining_trainings ??
                    p.remaining_trainings,
                  used_trainings:
                    response.payment?.used_trainings ?? p.used_trainings,
                }
              : p,
          ),
        );
        await loadCalendarMonth(currentMonth);
        if (selectedDate) {
          await handleDateClick(selectedDate, { silent: true });
        }
        showNotification(
          response.message || `Статус платежа обновлен на "${newStatus}"`,
        );
      }
    } catch (error) {
      console.error("Ошибка обновления платежа:", error);
      showNotification(error.message || "Ошибка обновления платежа", "error");
    }
  };

  // ========== ФУНКЦИИ ДЛЯ НАСТРОЕК ==========

  // ========== ФУНКЦИЯ ВЫХОДА ==========

  const handleLogout = () => {
    openConfirmDialog({
      title: "Выйти из административной панели?",
      message: "Текущая админская сессия завершится на этом устройстве.",
      confirmLabel: "Выйти",
      tone: "danger",
      onConfirm: () => {
        localStorage.removeItem("adminToken");
        window.location.href = "/admin/login";
      },
    });
  };

  // Функция для переключения меню и закрытия при клике на элемент
  const handleNavClick = (view) => {
    setActiveView(view);
    setSidebarOpen(false);
  };

  // ========== РЕНДЕР МОДАЛЬНОГО ОКНА РАСПИСАНИЯ ==========

  const requestCloseScheduleModal = useCallback(() => {
    openConfirmDialog({
      title: "Отменить изменения?",
      message:
        "Несохраненные правки в форме расписания будут потеряны, если закрыть окно сейчас.",
      confirmLabel: "Закрыть без сохранения",
      tone: "danger",
      onConfirm: () => {
        setShowAddScheduleModal(false);
        setEditingSchedule(null);
        resetScheduleForm();
      },
    });
  }, [openConfirmDialog]);

  const renderAddScheduleModal = () => {
    const isStartTimeValid = validateTime(scheduleForm.startTime);
    const isEndTimeValid = validateTime(scheduleForm.endTime);

    let isTimeRangeValid = false;
    let duration = null;
    let durationError = "";

    if (isStartTimeValid && isEndTimeValid) {
      const [startH, startM] = scheduleForm.startTime.split(":").map(Number);
      const [endH, endM] = scheduleForm.endTime.split(":").map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      if (endMinutes <= startMinutes) {
        durationError = "Время окончания должно быть позже времени начала";
      } else {
        isTimeRangeValid = true;
        const durationMinutes = endMinutes - startMinutes;
        duration = {
          hours: Math.floor(durationMinutes / 60),
          minutes: durationMinutes % 60,
        };
      }
    }

    return (
      <div
        className="modal-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            requestCloseScheduleModal();
          }
        }}
      >
        <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>
              {editingSchedule
                ? "Редактировать расписание"
                : "Добавить расписание"}
            </h3>
            <button className="close-btn" onClick={requestCloseScheduleModal}>
              <X size={20} />
            </button>
          </div>

          <div className="modal-body">
            <div className="schedule-form-container">
              <div className="form-group">
                <label>Годо-группа *</label>
                <select
                  value={scheduleForm.ageGroup}
                  onChange={(e) =>
                    setScheduleForm((prev) => ({
                      ...prev,
                      ageGroup: e.target.value,
                    }))
                  }
                  required
                >
                  <option value="">Выберите годо-группу</option>
                  {scheduleAgeGroupOptions.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={scheduleForm.ageGroup}
                  onChange={(e) =>
                    setScheduleForm((prev) => ({
                      ...prev,
                      ageGroup: e.target.value,
                    }))
                  }
                  placeholder="Свой диапазон, например 2012-2019"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Время начала *</label>
                  <div className="time-input-wrapper">
                    <input
                      type="text"
                      className={`time-input ${
                        scheduleForm.startTime && !isStartTimeValid
                          ? "invalid"
                          : ""
                      }`}
                      value={scheduleForm.startTime}
                      onChange={handleStartTimeChange}
                      onBlur={handleStartTimeBlur}
                      placeholder="ЧЧ:ММ"
                      maxLength="5"
                    />
                  </div>
                  {scheduleForm.startTime && !isStartTimeValid && (
                    <div className="time-error">
                      Введите время в формате ЧЧ:ММ (например 17:00, 09:30)
                    </div>
                  )}
                  <div className="time-hint">
                    Примеры: 9:00, 09:00, 1730, 17:30
                  </div>
                </div>

                <div className="form-group">
                  <label>Время окончания *</label>
                  <div className="time-input-wrapper">
                    <input
                      type="text"
                      className={`time-input ${
                        scheduleForm.endTime && !isEndTimeValid ? "invalid" : ""
                      }`}
                      value={scheduleForm.endTime}
                      onChange={handleEndTimeChange}
                      onBlur={handleEndTimeBlur}
                      placeholder="ЧЧ:ММ"
                      maxLength="5"
                    />
                  </div>
                  {scheduleForm.endTime && !isEndTimeValid && (
                    <div className="time-error">
                      Введите время в формате ЧЧ:ММ (например 18:00, 19:30)
                    </div>
                  )}
                  <div className="time-hint">Примеры: 18:00, 1830, 19:30</div>
                </div>
              </div>

              {duration && (
                <div className={`duration-info valid`}>
                  <strong>Продолжительность:</strong> {duration.hours} ч{" "}
                  {duration.minutes} мин
                </div>
              )}

              {durationError && (
                <div className="duration-info invalid">
                  <span className="duration-error">⚠ {durationError}</span>
                </div>
              )}

              <div className="form-group">
                <label>Дни недели *</label>
                <div className="days-selector">
                  {weekDays.map((day) => (
                    <div key={day.id} className="day-checkbox-item">
                      <input
                        type="checkbox"
                        id={`day-${day.id}`}
                        checked={scheduleForm.days.includes(day.id)}
                        onChange={() => toggleDaySelection(day.id)}
                      />
                      <label htmlFor={`day-${day.id}`}>{day.short}</label>
                    </div>
                  ))}
                </div>

                {scheduleForm.days.length > 0 && (
                  <div className="selected-days-list">
                    <small>Выбрано: {getSelectedDaysLabels()}</small>
                  </div>
                )}

                {scheduleForm.days.length === 0 && (
                  <div className="error-message">
                    Выберите хотя бы один день
                  </div>
                )}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Филиал *</label>
                  <select
                    value={scheduleForm.branchId}
                    onChange={(e) =>
                      setScheduleForm((prev) => ({
                        ...prev,
                        branchId: e.target.value,
                      }))
                    }
                    required
                  >
                    <option value="">Выберите филиал</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Макс. мест</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={scheduleForm.maxCapacity}
                    onChange={(e) =>
                      setScheduleForm((prev) => ({
                        ...prev,
                        maxCapacity: parseInt(e.target.value) || 15,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Инструктор (необязательно)</label>
                <input
                  type="text"
                  value={scheduleForm.instructor}
                  onChange={(e) =>
                    setScheduleForm((prev) => ({
                      ...prev,
                      instructor: e.target.value,
                    }))
                  }
                  placeholder="Имя инструктора"
                />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button
              className="cancel-btn"
              onClick={() => {
                setShowAddScheduleModal(false);
                setEditingSchedule(null);
                resetScheduleForm();
              }}
            >
              Отмена
            </button>
            <button
              className={`confirm-btn ${
                !scheduleForm.ageGroup ||
                !scheduleForm.branchId ||
                scheduleForm.days.length === 0 ||
                !isStartTimeValid ||
                !isEndTimeValid ||
                !isTimeRangeValid
                  ? "disabled"
                  : ""
              }`}
              onClick={editingSchedule ? handleEditSchedule : handleAddSchedule}
              disabled={
                !scheduleForm.ageGroup ||
                !scheduleForm.branchId ||
                scheduleForm.days.length === 0 ||
                !isStartTimeValid ||
                !isEndTimeValid ||
                !isTimeRangeValid
              }
            >
              <Save size={20} />
              {editingSchedule ? "Сохранить изменения" : "Добавить расписание"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ========== РЕНДЕР МОДАЛЬНЫХ ОКОН ФИЛИАЛОВ ==========

  const renderBranchPhotoField = () => (
    <div className="form-group">
      <label>Фотография филиала</label>
      <div className="branch-photo-upload">
        {branchForm.photoData ? (
          <div className="branch-photo-preview-wrapper">
            <img
              src={branchForm.photoData}
              alt={branchForm.name || "Предпросмотр филиала"}
              className="branch-photo-preview"
            />
            <button
              type="button"
              className="branch-photo-remove-btn"
              onClick={() =>
                setBranchForm((prev) => ({ ...prev, photoData: null }))
              }
            >
              <Trash2 size={14} />
              Удалить фото
            </button>
          </div>
        ) : (
          <div className="branch-photo-placeholder">
            <Building size={28} />
            <span>Фотография пока не выбрана</span>
          </div>
        )}

        <label className="branch-photo-picker">
          <Upload size={16} />
          <span>
            {branchForm.photoData ? "Заменить фото" : "Загрузить фото"}
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={handleBranchPhotoChange}
          />
        </label>

        <p className="branch-photo-hint">PNG, JPG, WEBP или GIF до 5 МБ</p>
      </div>
    </div>
  );

  const renderAddBranchModal = () => (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          closeAddBranchModal();
        }
      }}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Добавить филиал</h3>
          <button className="close-btn" onClick={closeAddBranchModal}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label>Название филиала *</label>
            <input
              type="text"
              value={branchForm.name}
              onChange={(e) =>
                setBranchForm((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="Например: Центральный филиал"
            />
          </div>

          <div className="form-group">
            <label>Адрес *</label>
            <input
              type="text"
              value={branchForm.address}
              onChange={(e) =>
                setBranchForm((prev) => ({ ...prev, address: e.target.value }))
              }
              placeholder="Полный адрес"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Телефон</label>
              <input
                type="tel"
                value={branchForm.phone}
                onChange={(e) =>
                  setBranchForm((prev) => ({ ...prev, phone: e.target.value }))
                }
                placeholder="+7 (XXX) XXX-XX-XX"
              />
            </div>

            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={branchForm.email}
                onChange={(e) =>
                  setBranchForm((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="email@example.com"
              />
            </div>
          </div>

          {renderBranchPhotoField()}

          <div className="form-group">
            <label>Статус</label>
            <select
              value={branchForm.status}
              onChange={(e) =>
                setBranchForm((prev) => ({ ...prev, status: e.target.value }))
              }
            >
              <option value="active">Активен</option>
              <option value="inactive">Неактивен</option>
            </select>
          </div>
        </div>

        <div className="modal-footer">
          <button className="cancel-btn" onClick={closeAddBranchModal}>
            Отмена
          </button>
          <button className="confirm-btn" onClick={handleSaveBranch}>
            <Save size={20} />
            Добавить филиал
          </button>
        </div>
      </div>
    </div>
  );

  const renderEditBranchModal = () => (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          closeEditBranchModal();
        }
      }}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Редактировать филиал</h3>
          <button className="close-btn" onClick={closeEditBranchModal}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label>Название филиала *</label>
            <input
              type="text"
              value={branchForm.name}
              onChange={(e) =>
                setBranchForm((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="Например: Центральный филиал"
            />
          </div>

          <div className="form-group">
            <label>Адрес *</label>
            <input
              type="text"
              value={branchForm.address}
              onChange={(e) =>
                setBranchForm((prev) => ({ ...prev, address: e.target.value }))
              }
              placeholder="Полный адрес"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Телефон</label>
              <input
                type="tel"
                value={branchForm.phone}
                onChange={(e) =>
                  setBranchForm((prev) => ({ ...prev, phone: e.target.value }))
                }
                placeholder="+7 (XXX) XXX-XX-XX"
              />
            </div>

            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={branchForm.email}
                onChange={(e) =>
                  setBranchForm((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="email@example.com"
              />
            </div>
          </div>

          {renderBranchPhotoField()}

          <div className="form-group">
            <label>Статус</label>
            <select
              value={branchForm.status}
              onChange={(e) =>
                setBranchForm((prev) => ({ ...prev, status: e.target.value }))
              }
            >
              <option value="active">Активен</option>
              <option value="inactive">Неактивен</option>
            </select>
          </div>
        </div>

        <div className="modal-footer">
          <button className="cancel-btn" onClick={closeEditBranchModal}>
            Отмена
          </button>
          <button className="confirm-btn" onClick={handleSaveBranch}>
            <Save size={20} />
            Сохранить изменения
          </button>
        </div>
      </div>
    </div>
  );

  // ========== РЕНДЕР ОСНОВНЫХ ВИДОВ ==========

  const renderDashboard = () => (
    <div className="dashboard-content odesk-viewFrame">
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon primary">
            <Users size={24} />
          </div>
          <div className="stat-info">
            <h3>{users.length}</h3>
            <p>Всего учеников</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon success">
            <Calendar size={24} />
          </div>
          <div className="stat-info">
            <h3>{schedules.filter((s) => s.isActive !== false).length}</h3>
            <p>Активных расписаний</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon warning">
            <Building size={24} />
          </div>
          <div className="stat-info">
            <h3>{branches.filter((b) => b.status === "active").length}</h3>
            <p>Активных филиалов</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon secondary">
            <DollarSign size={24} />
          </div>
          <div className="stat-info">
            <h3>{payments.length}</h3>
            <p>Всего оплат</p>
          </div>
        </div>
      </div>

      <div className="quick-actions">
        <h2>Быстрые действия</h2>
        <div className="actions-grid">
          <div
            className="action-card"
            onClick={() => setActiveView("schedule")}
          >
            <CalendarClock size={24} />
            <span>Управление расписанием</span>
          </div>

          <div
            className="action-card"
            onClick={() => {
              resetScheduleForm();
              setShowAddScheduleModal(true);
            }}
          >
            <Plus size={24} />
            <span>Добавить расписание</span>
          </div>

          <div
            className="action-card"
            onClick={() => setActiveView("branches")}
          >
            <Building size={24} />
            <span>Управление филиалами</span>
          </div>

          <div
            className="action-card"
            onClick={() => setActiveView("payments")}
          >
            <CreditCard size={24} />
            <span>Просмотр оплат</span>
          </div>

          <div
            className="action-card"
            onClick={loadAllData}
            style={{ cursor: "pointer" }}
          >
            <RefreshCw size={24} />
            <span>Обновить данные</span>
          </div>
        </div>
      </div>

      <div className="recent-section">
        <div className="section-header">
          <h2>Последние платежи</h2>
          <button
            className="text-btn"
            onClick={() => setActiveView("payments")}
          >
            Все платежи
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="payments-list">
          {payments.slice(0, 3).map((payment) => (
            <div key={payment.id} className="payment-item">
              <div className="payment-icon">
                <DollarSign size={20} />
              </div>
              <div className="payment-details">
                <h4>{payment.user_name}</h4>
                <p>
                  {payment.child_name} • {payment.amount} руб.
                </p>
                <small>
                  {new Date(payment.created_at).toLocaleDateString("ru-RU")}
                </small>
              </div>
              <div className={`status-badge ${payment.status}`}>
                {payment.status === "confirmed"
                  ? "Подтвержден"
                  : payment.status === "pending"
                    ? "Ожидает"
                    : payment.status === "failed"
                      ? "Ошибка"
                      : payment.status}
              </div>
            </div>
          ))}
          {payments.length === 0 && (
            <div className="empty-state">
              <DollarSign size={24} />
              <p>Платежей пока нет</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderScheduleManagement = () => (
    <div className="schedule-management odesk-viewFrame">
      <div className="section-header">
        <h2>Управление расписанием</h2>
        <button
          className="primary-btn"
          onClick={() => {
            resetScheduleForm();
            setShowAddScheduleModal(true);
          }}
        >
          <Plus size={20} />
          Добавить расписание
        </button>
      </div>

      <div className="filters-panel">
        <div className="filter-group">
          <label>Годо-группа</label>
          <select
            value={selectedAgeGroup}
            onChange={(e) => handleAgeGroupFilterChange(e.target.value)}
          >
            <option value="all">Все группы</option>
            {scheduleAgeGroupOptions.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Филиал</label>
          <select
            value={selectedBranchFilter}
            onChange={(e) => handleBranchFilterChange(e.target.value)}
          >
            <option value="all">Все филиалы</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>

        <button className="secondary-btn" onClick={loadAllData}>
          <RefreshCw size={16} />
          Обновить
        </button>
      </div>

      {schedules.length === 0 ? (
        <div className="empty-state">
          <Calendar size={48} />
          <h3>Расписаний пока нет</h3>
          <p>Добавьте первое расписание, чтобы начать</p>
          <button
            className="primary-btn mt-4"
            onClick={() => {
              resetScheduleForm();
              setShowAddScheduleModal(true);
            }}
          >
            <Plus size={20} />
            Добавить расписание
          </button>
        </div>
      ) : (
        <div className="schedule-container">
          {schedules
            .filter((schedule) => schedule.isActive !== false)
            .filter(
              (schedule) =>
                (selectedAgeGroup === "all" ||
                  schedule.ageGroup === selectedAgeGroup) &&
                (selectedBranchFilter === "all" ||
                  schedule.branchId === selectedBranchFilter.toString()),
            )
            .map((schedule) => (
              <div key={schedule.id} className="schedule-card">
                <div className="schedule-header">
                  <div className="schedule-time">
                    {schedule.startTime} — {schedule.endTime}
                  </div>
                  <div className="schedule-age-group">{schedule.ageGroup}</div>
                </div>

                <div className="schedule-info">
                  <div className="info-item">
                    <Building size={16} />
                    <span>{schedule.branchName}</span>
                  </div>

                  <div className="info-item">
                    <CalendarDays size={16} />
                    <span>Дни: {schedule.allDaysDisplay}</span>
                  </div>

                  <div className="info-item">
                    <Users size={16} />
                    <span>Мест: {schedule.maxCapacity}</span>
                  </div>

                  {schedule.instructor && (
                    <div className="info-item">
                      <UserCheck size={16} />
                      <span>Инструктор: {schedule.instructor}</span>
                    </div>
                  )}
                </div>

                <div className="schedule-footer">
                  <div className="schedule-actions">
                    <button
                      className="icon-btn"
                      onClick={() => {
                        setEditingSchedule(schedule);
                        setScheduleForm({
                          ageGroup: schedule.ageGroup,
                          startTime: schedule.startTime,
                          endTime: schedule.endTime,
                          branchId: schedule.branchId.toString(),
                          days: schedule.days,
                          maxCapacity: schedule.maxCapacity,
                          instructor: schedule.instructor || "",
                          isStartTimeManual: true,
                          isEndTimeManual: true,
                        });
                        setShowAddScheduleModal(true);
                      }}
                      title="Редактировать"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      className="icon-btn danger"
                      onClick={() => handleDeleteSchedule(schedule.id)}
                      title="Удалить"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );

  const renderCalendar = () => {
    const days = getDaysInMonth(currentMonth);
    const monthName = currentMonth.toLocaleDateString("ru-RU", {
      month: "long",
      year: "numeric",
    });
    const monthSessionEntries = days
      .filter(Boolean)
      .map((date) => ({
        date,
        sessions: calendarSessionsByDate[formatDateKey(date)] || [],
      }))
      .filter(({ sessions }) => sessions.length > 0);
    const selectedDateKey = selectedDate ? formatDateKey(selectedDate) : "";
    const totalMonthSessions = monthSessionEntries.reduce(
      (total, day) => total + day.sessions.length,
      0,
    );
    const groupedAttendanceEntries = dayDetails
      ? Object.entries(dayDetails.grouped_attendance)
      : [];

    const getMobileWeekday = (date) =>
      date
        .toLocaleDateString("ru-RU", { weekday: "short" })
        .replace(".", "")
        .toUpperCase();

    const getMobileTimePreview = (sessions) => {
      const uniqueTimes = Array.from(
        new Set(sessions.map((session) => session.startTime).filter(Boolean)),
      );

      if (!uniqueTimes.length) {
        return "Время уточняется";
      }

      const preview = uniqueTimes.slice(0, 2).join(" • ");
      return uniqueTimes.length > 2
        ? `${preview} +${uniqueTimes.length - 2}`
        : preview;
    };

    const groupRecordsByAgeGroup = (records) =>
      records.reduce((accumulator, record) => {
        const groupKey = record.age_group || "Без группы";
        if (!accumulator[groupKey]) {
          accumulator[groupKey] = [];
        }
        accumulator[groupKey].push(record);
        return accumulator;
      }, {});

    return (
      <div className="calendar-content odesk-viewFrame">
        <div className="calendar-header">
          <div className="month-navigation">
            <button className="nav-btn" onClick={handlePrevMonth}>
              <ChevronLeft size={20} />
            </button>
            <h2>{monthName}</h2>
            <button className="nav-btn" onClick={handleNextMonth}>
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="calendar-filters">
            <div className="filter-group">
              <label>Годо-группа:</label>
              <select
                value={selectedAgeGroup}
                onChange={(e) => handleAgeGroupFilterChange(e.target.value)}
              >
                <option value="all">Все группы</option>
                {scheduleAgeGroupOptions.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Филиал:</label>
              <select
                value={selectedBranchFilter}
                onChange={(e) => handleBranchFilterChange(e.target.value)}
              >
                <option value="all">Все филиалы</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="calendar-grid">
          {isMobileViewport ? (
            <div className="calendar-mobile-shell">
              <div className="calendar-mobile-summary">
                <div className="calendar-mobile-stat">
                  <span className="calendar-mobile-stat-label">
                    Дней с тренировками
                  </span>
                  <strong>{monthSessionEntries.length}</strong>
                </div>
                <div className="calendar-mobile-stat">
                  <span className="calendar-mobile-stat-label">
                    Всего занятий
                  </span>
                  <strong>{totalMonthSessions}</strong>
                </div>
              </div>

              {monthSessionEntries.length === 0 ? (
                <div className="calendar-mobile-empty empty-state">
                  <Users size={40} />
                  <p>В этом месяце нет занятий по выбранным фильтрам</p>
                </div>
              ) : (
                <div className="calendar-mobile-days">
                  {monthSessionEntries.map(({ date, sessions }) => {
                    const isToday =
                      date.toDateString() === new Date().toDateString();
                    const isSelected =
                      selectedDateKey === formatDateKey(date);

                    return (
                      <button
                        key={date.toISOString()}
                        type="button"
                        className={`calendar-mobile-day ${
                          isToday ? "today" : ""
                        } ${isSelected ? "selected" : ""}`}
                        onClick={() => handleDateClick(date)}
                      >
                        <div className="calendar-mobile-day-top">
                          <div className="calendar-mobile-day-date">
                            <span className="calendar-mobile-day-number">
                              {date.getDate()}
                            </span>
                            <span className="calendar-mobile-day-weekday">
                              {getMobileWeekday(date)}
                            </span>
                          </div>
                          {isToday && (
                            <span className="calendar-mobile-badge">
                              Сегодня
                            </span>
                          )}
                        </div>
                        <div className="calendar-mobile-day-body">
                          <strong>{sessions.length} занятий</strong>
                          <span>{getMobileTimePreview(sessions)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {!dayDetails && monthSessionEntries.length > 0 && (
                <div className="calendar-mobile-hint">
                  Выберите день, чтобы открыть список групп и отметить детей.
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="calendar-weekdays">
                {calendarWeekDays.map((day) => (
                  <div key={day} className="weekday">
                    {day}
                  </div>
                ))}
              </div>

              <div className="calendar-days">
                {days.map((date, index) => {
                  if (!date) {
                    return (
                      <div key={`empty-${index}`} className="calendar-day empty" />
                    );
                  }

                  const isToday =
                    date.toDateString() === new Date().toDateString();
                  const isSelected =
                    selectedDate.toDateString() === date.toDateString();
                  const daySchedules =
                    calendarSessionsByDate[formatDateKey(date)] || [];

                  return (
                    <div
                      key={date.toISOString()}
                      className={`calendar-day ${isToday ? "today" : ""} ${
                        isSelected ? "selected" : ""
                      }`}
                      onClick={() => handleDateClick(date)}
                    >
                      <div className="day-header">
                        <span className="day-number">{date.getDate()}</span>
                        <span className="day-name">
                          {calendarWeekDays[(date.getDay() + 6) % 7]}
                        </span>
                      </div>

                      {daySchedules.length > 0 && (
                        <div className="day-sessions">
                          <div className="session-count">
                            {daySchedules.length} занятий
                          </div>
                          <div className="session-dots">
                            {daySchedules.slice(0, 5).map((schedule, idx) => (
                              <div
                                key={idx}
                                className="session-dot scheduled"
                                title={`${schedule.ageGroup}: ${
                                  schedule.startTime
                                }-${schedule.endTime} (${
                                  schedule.instructor || "без инструктора"
                                })`}
                              />
                            ))}
                            {daySchedules.length > 5 && (
                              <span className="more-dots">
                                +{daySchedules.length - 5}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {dayDetails && (
          <div className="day-details mt-6">
            <h3>Дети на тренировке {dayDetails.date_display}</h3>
            <p className="text-muted mb-4">
              Всего: {dayDetails.total_children} детей
            </p>

            {Object.keys(dayDetails.grouped_attendance).length === 0 ? (
              <div className="empty-state">
                <Users size={48} />
                <p>Нет запланированных посещений на этот день</p>
              </div>
            ) : (
              <div className="attendance-groups">
                {groupedAttendanceEntries.map(([time, records]) => {
                  const groupedRecords = groupRecordsByAgeGroup(records);
                  const ageGroupEntries = Object.entries(groupedRecords);

                  return (
                    <div key={time} className="time-group">
                      <div className="time-group-header">
                        <div className="time-group-title">
                          <h4>
                            {time} ({records.length} детей)
                          </h4>
                          <div className="time-group-tags">
                            {ageGroupEntries.map(([groupName, groupRecords]) => (
                              <span
                                key={`${time}-${groupName}`}
                                className="time-group-tag"
                              >
                                {groupName}: {groupRecords.length}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="bulk-actions">
                          <button
                            className="small-btn success"
                            onClick={() => {
                              const allIds = records.map((r) => r.id);
                              handleBulkMarkAttendance(allIds, "attended");
                            }}
                            title="Отметить всех как присутствующих"
                          >
                            <CheckCircle size={14} />
                            <span>Все были</span>
                          </button>
                          <button
                            className="small-btn error"
                            onClick={() => {
                              const allIds = records.map((r) => r.id);
                              handleBulkMarkAttendance(allIds, "missed");
                            }}
                            title="Отметить всех как отсутствующих"
                          >
                            <X size={14} />
                            <span>Все не были</span>
                          </button>
                        </div>
                      </div>
                      <div className="attendance-group-list">
                        {ageGroupEntries.map(([groupName, groupRecords]) => (
                          <div
                            key={`${time}-${groupName}`}
                            className="attendance-subgroup"
                          >
                            <div className="attendance-subgroup-header">
                              <span className="attendance-subgroup-label">
                                {groupName}
                              </span>
                              <span className="attendance-subgroup-count">
                                {groupRecords.length} детей
                              </span>
                            </div>
                            <div className="attendance-subgroup-records">
                              {groupRecords.map((record) => (
                                <div
                                  key={record.id}
                                  className="attendance-record"
                                >
                                  <div className="record-main">
                                    <div className="record-header">
                                      <strong>{record.child_name}</strong>
                                      <span
                                        className={`status-badge ${getStatusColor(
                                          record.status,
                                        )}`}
                                      >
                                        {getStatusText(record.status)}
                                      </span>
                                    </div>
                                    <div className="record-quick-meta">
                                      {record.user_name && (
                                        <span>{record.user_name}</span>
                                      )}
                                      {record.user_phone && (
                                        <span>{record.user_phone}</span>
                                      )}
                                      {record.birth_year && (
                                        <span>{record.birth_year} г.р.</span>
                                      )}
                                    </div>
                                    <div className="attendance-meta-grid">
                                      <div className="attendance-meta-card">
                                        <span className="attendance-meta-label">
                                          Филиал
                                        </span>
                                        <span className="attendance-meta-value">
                                          {record.branch_name || "Не указан"}
                                        </span>
                                      </div>
                                      <div className="attendance-meta-card">
                                        <span className="attendance-meta-label">
                                          Осталось занятий
                                        </span>
                                        <span
                                          className={`attendance-meta-value remaining-trainings ${
                                            record.payment_info
                                              ?.remaining_trainings > 0
                                              ? "success"
                                              : "warning"
                                          }`}
                                        >
                                          {record.payment_info
                                            ?.remaining_trainings || 0}{" "}
                                          /{" "}
                                          {record.payment_info
                                            ?.training_count || 0}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="record-actions">
                                    <div className="attendance-buttons">
                                      <button
                                        className={`small-btn attendance-toggle attended ${
                                          record.status === "attended"
                                            ? "is-active"
                                            : ""
                                        }`}
                                        onClick={() =>
                                          handleMarkAttendance(
                                            record.id,
                                            "attended",
                                            record.child_name,
                                          )
                                        }
                                        title="Отметить присутствие"
                                      >
                                        <CheckCircle size={14} />
                                        <span>Был</span>
                                      </button>
                                      <button
                                        className={`small-btn attendance-toggle missed ${
                                          record.status === "missed"
                                            ? "is-active"
                                            : ""
                                        }`}
                                        onClick={() =>
                                          handleMarkAttendance(
                                            record.id,
                                            "missed",
                                            record.child_name,
                                          )
                                        }
                                        title="Отметить отсутствие"
                                      >
                                        <X size={14} />
                                        <span>Не был</span>
                                      </button>
                                      <button
                                        className={`small-btn attendance-toggle scheduled ${
                                          record.status === "scheduled"
                                            ? "is-active"
                                            : ""
                                        }`}
                                        onClick={() =>
                                          handleMarkAttendance(
                                            record.id,
                                            "scheduled",
                                            record.child_name,
                                          )
                                        }
                                        title="Вернуть в запланированные"
                                      >
                                        <Clock size={14} />
                                        <span>Заплан</span>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderUsers = () => (
    <div className="users-content">
      <div className="section-header">
        <h2>Управление учениками</h2>
        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Поиск по имени, email или телефону..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="users-table">
        <div className="table-header">
          <div className="header-cell">Имя</div>
          <div className="header-cell">Телефон</div>
          <div className="header-cell">Email</div>
          <div className="header-cell">Год рождения</div>
          <div className="header-cell">Годо-группа</div>
          <div className="header-cell">Дети</div>
          <div className="header-cell">Регистрация</div>
          <div className="header-cell">Действия</div>
        </div>

        <div className="table-body">
          {filteredUsers.length === 0 ? (
            <div className="empty-state">
              <Users size={48} />
              <p>{searchTerm ? "Ученики не найдены" : "Учеников пока нет"}</p>
            </div>
          ) : (
            filteredUsers.map((user) => (
              <div key={user.id} className="table-row">
                <div className="table-cell">{user.name}</div>
                <div className="table-cell">{user.phone}</div>
                <div className="table-cell">{user.email}</div>
                <div className="table-cell">
                  {user.birthYear || "Не указан"}
                </div>
                <div className="table-cell">
                  <span className="age-group">{user.ageGroup}</span>
                </div>
                <div className="table-cell">
                  {user.children?.length > 0 ? (
                    <div className="children-list">
                      {user.children.map((child) => (
                        <div key={child.id} className="child-item">
                          {child.name} ({child.birth_year} г.р.)
                        </div>
                      ))}
                    </div>
                  ) : (
                    "Нет детей"
                  )}
                </div>
                <div className="table-cell">
                  {user.registered_at
                    ? new Date(user.registered_at).toLocaleDateString("ru-RU")
                    : "Не указана"}
                </div>
                <div className="table-cell">
                  <div className="action-buttons">
                    <button
                      className="icon-btn small"
                      title="Просмотр"
                      onClick={() => {
                        /* Просмотр деталей */
                      }}
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      className="icon-btn small danger"
                      title="Удалить"
                      onClick={() => handleDeleteUser(user.id, user.name)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  const renderUserModal = () => (
    <div className="modal-overlay" onClick={closeUserModal}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {editingUser
              ? "Редактировать пользователя"
              : "Добавить пользователя"}
          </h3>
          <button className="close-btn" onClick={closeUserModal}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="schedule-form-container">
            <div className="form-row">
              <div className="form-group">
                <label>Имя родителя / пользователя *</label>
                <input
                  type="text"
                  value={userForm.name}
                  onChange={(e) =>
                    handleUserFieldChange("name", e.target.value)
                  }
                />
              </div>
              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(e) =>
                    handleUserFieldChange("email", e.target.value)
                  }
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Телефон</label>
                <input
                  type="text"
                  value={userForm.phone}
                  onChange={(e) =>
                    handleUserFieldChange("phone", e.target.value)
                  }
                />
              </div>
              <div className="form-group">
                <label>{editingUser ? "Новый пароль" : "Пароль *"}</label>
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(e) =>
                    handleUserFieldChange("password", e.target.value)
                  }
                  placeholder={
                    editingUser ? "Оставьте пустым, чтобы не менять" : ""
                  }
                />
              </div>
            </div>

            <div className="settings-card user-children-card">
              <div className="settings-card-header">
                <h3>Дети</h3>
                <button className="secondary-btn" onClick={handleAddChildRow}>
                  <Plus size={16} />
                  Добавить ребенка
                </button>
              </div>

              <div className="user-children-list">
                {userForm.children.map((child, index) => (
                  <div key={child.id} className="user-child-editor">
                    <div className="form-row">
                      <div className="form-group">
                        <label>Имя ребенка *</label>
                        <input
                          type="text"
                          value={child.name}
                          onChange={(e) =>
                            handleChildFieldChange(
                              child.id,
                              "name",
                              e.target.value,
                            )
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label>Год рождения *</label>
                        <input
                          type="number"
                          min="2000"
                          max="2035"
                          value={child.birth_year}
                          onChange={(e) =>
                            handleChildFieldChange(
                              child.id,
                              "birth_year",
                              e.target.value,
                            )
                          }
                        />
                      </div>
                    </div>

                    <div className="form-row user-child-actions-row">
                      <div className="form-group">
                        <label>Филиал</label>
                        <select
                          value={child.branch_id}
                          onChange={(e) =>
                            handleChildFieldChange(
                              child.id,
                              "branch_id",
                              e.target.value,
                            )
                          }
                        >
                          <option value="">Не выбран</option>
                          {branches.map((branch) => (
                            <option key={branch.id} value={branch.id}>
                              {branch.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group user-child-remove">
                        <label>&nbsp;</label>
                        <button
                          className="danger-btn"
                          onClick={() => handleRemoveChildRow(child.id)}
                          disabled={
                            userForm.children.length === 1 && index === 0
                          }
                        >
                          <Trash2 size={16} />
                          Удалить
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="cancel-btn" onClick={closeUserModal}>
            Отмена
          </button>
          <button
            className="confirm-btn"
            onClick={handleSaveUser}
            disabled={savingUser}
          >
            <Save size={18} />
            {savingUser
              ? "Сохранение..."
              : editingUser
                ? "Сохранить изменения"
                : "Добавить пользователя"}
          </button>
        </div>
      </div>
    </div>
  );

  const renderTrainerModal = () => (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          closeTrainerModal();
        }
      }}
    >
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {typeof editingTrainerIndex === "number"
              ? "Редактировать тренера"
              : "Добавить тренера"}
          </h3>
          <button className="close-btn" onClick={closeTrainerModal}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="trainer-modal-grid">
            <div className="trainer-photo-editor">
              {trainerForm.photo_data ? (
                <div className="trainer-photo-preview-wrapper">
                  <img
                    src={trainerForm.photo_data}
                    alt={trainerForm.name || "Предпросмотр тренера"}
                    className="trainer-photo-preview"
                  />
                  <button
                    type="button"
                    className="branch-photo-remove-btn"
                    onClick={() => handleTrainerFormFieldChange("photo_data", "")}
                  >
                    <Trash2 size={14} />
                    Удалить фото
                  </button>
                </div>
              ) : (
                <div className="trainer-photo-placeholder">
                  <Users size={28} />
                  <span>Фотография тренера не выбрана</span>
                </div>
              )}

              <label className="branch-photo-picker">
                <Upload size={16} />
                <span>
                  {trainerForm.photo_data ? "Заменить фото" : "Загрузить фото"}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => handleTrainerPhotoChange(e.target.files?.[0])}
                />
              </label>
              <p className="branch-photo-hint">PNG, JPG, WEBP или GIF до 5 МБ</p>
            </div>

            <div className="trainer-modal-fields">
              <div className="form-row">
                <div className="form-group">
                  <label>Имя</label>
                  <input
                    type="text"
                    value={trainerForm.name}
                    onChange={(e) =>
                      handleTrainerFormFieldChange("name", e.target.value)
                    }
                    placeholder="Например: Иван Петров"
                  />
                </div>
                <div className="form-group">
                  <label>Должность / роль</label>
                  <input
                    type="text"
                    value={trainerForm.title}
                    onChange={(e) =>
                      handleTrainerFormFieldChange("title", e.target.value)
                    }
                    placeholder="Главный тренер"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Описание</label>
                <textarea
                  value={trainerForm.description}
                  onChange={(e) =>
                    handleTrainerFormFieldChange("description", e.target.value)
                  }
                  rows={8}
                  placeholder="Коротко о тренере, специализации, опыте и подходе к детям"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          {typeof editingTrainerIndex === "number" && (
            <button
              className="danger-btn"
              onClick={() => handleRemoveTrainer(editingTrainerIndex)}
            >
              <Trash2 size={16} />
              Удалить
            </button>
          )}
          <button className="cancel-btn" onClick={closeTrainerModal}>
            Отмена
          </button>
          <button className="confirm-btn" onClick={handleSaveTrainer}>
            <Save size={18} />
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );

  const renderPaymentPlanModal = () => (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          closePaymentPlanModal();
        }
      }}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {typeof editingPaymentPlanIndex === "number"
              ? "Редактировать тариф"
              : "Добавить тариф"}
          </h3>
          <button className="close-btn" onClick={closePaymentPlanModal}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="payment-plan-modal-fields">
            <div className="payment-plan-modal-preview">
              <span className="payment-plan-chip">
                <CreditCard size={16} />
              </span>
              <div className="payment-plan-modal-copy">
                <strong>
                  {paymentPlanForm.name?.trim() ||
                    `Тариф ${typeof editingPaymentPlanIndex === "number" ? editingPaymentPlanIndex + 1 : siteContent.paymentPlans.length + 1}`}
                </strong>
                <p>
                  {paymentPlanForm.description?.trim() ||
                    "Кратко опишите, для какого формата занятий подходит этот тариф"}
                </p>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Название тарифа</label>
                <input
                  type="text"
                  value={paymentPlanForm.name}
                  onChange={(e) =>
                    handlePaymentPlanFormFieldChange("name", e.target.value)
                  }
                  placeholder="Например: Стандартный"
                />
              </div>
              <div className="form-group payment-plan-number-group">
                <label>Тренировок</label>
                <input
                  type="number"
                  min="1"
                  value={paymentPlanForm.trainings}
                  onChange={(e) =>
                    handlePaymentPlanFormFieldChange(
                      "trainings",
                      e.target.value,
                    )
                  }
                  placeholder="8"
                />
              </div>
              <div className="form-group payment-plan-number-group">
                <label>Стоимость, ₽</label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={paymentPlanForm.price}
                  onChange={(e) =>
                    handlePaymentPlanFormFieldChange("price", e.target.value)
                  }
                  placeholder="4000"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Описание</label>
              <textarea
                value={paymentPlanForm.description}
                onChange={(e) =>
                  handlePaymentPlanFormFieldChange(
                    "description",
                    e.target.value,
                  )
                }
                rows={5}
                placeholder="Например: 2 тренировки в неделю"
              />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          {typeof editingPaymentPlanIndex === "number" && (
            <button
              className="danger-btn"
              onClick={() => handleRemovePaymentPlan(editingPaymentPlanIndex)}
            >
              <Trash2 size={16} />
              Удалить
            </button>
          )}
          <button className="cancel-btn" onClick={closePaymentPlanModal}>
            Отмена
          </button>
          <button className="confirm-btn" onClick={handleSavePaymentPlan}>
            <Save size={18} />
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );

  const renderUsersView = () => (
    <div className="users-content odesk-viewFrame">
      <div className="section-header">
        <h2>Пользователи и дети</h2>
        <div className="header-actions-inline">
          <div className="search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Поиск по имени, email, телефону или ребенку..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="primary-btn" onClick={handleCreateUser}>
            <UserPlus size={18} />
            Добавить
          </button>
        </div>
      </div>

      <div className="list-toolbar">
        <div className="list-toolbar-copy">
          <strong>{sortedUsers.length}</strong>
          <span>
            {searchTerm ? "результатов по текущему поиску" : "родителей в базе"}
          </span>
        </div>
        <div className="sort-pills">
          <button
            type="button"
            className="sort-pill-button"
            onClick={() => handleUserSortChange("name")}
          >
            {renderSortButton(
              "По имени",
              userSort.field === "name",
              userSort.direction,
            )}
          </button>
          <button
            type="button"
            className="sort-pill-button"
            onClick={() => handleUserSortChange("children_count")}
          >
            {renderSortButton(
              "По детям",
              userSort.field === "children_count",
              userSort.direction,
            )}
          </button>
          <button
            type="button"
            className="sort-pill-button"
            onClick={() => handleUserSortChange("registered_at")}
          >
            {renderSortButton(
              "По дате регистрации",
              userSort.field === "registered_at",
              userSort.direction,
            )}
          </button>
        </div>
      </div>

      <div className="users-table">
        <div className="table-header users-grid">
          <div className="header-cell">Пользователь</div>
          <div className="header-cell">Контакты</div>
          <div className="header-cell">Дети</div>
          <div className="header-cell">Филиалы</div>
          <div className="header-cell">Регистрация</div>
          <div className="header-cell">Действия</div>
        </div>

        <div className="table-body">
          {sortedUsers.length === 0 ? (
            <div className="empty-state">
              <Users size={48} />
              <p>
                {searchTerm
                  ? "Пользователи не найдены"
                  : "Пока нет ни одного пользователя"}
              </p>
            </div>
          ) : (
            paginatedUsers.map((user) => (
              <div key={user.id} className="table-row users-grid">
                <div className="table-cell user-primary-cell">
                  <strong>{user.name}</strong>
                  <span className="text-muted">
                    {user.stats?.children_count || user.children?.length || 0}{" "}
                    дет.
                  </span>
                </div>
                <div className="table-cell user-contacts-cell">
                  <span>{user.phone || "Телефон не указан"}</span>
                  <span>{user.email || "Email не указан"}</span>
                </div>
                <div className="table-cell">
                  {user.children?.length > 0 ? (
                    <div className="children-list">
                      {user.children.map((child) => (
                        <div key={child.id} className="child-item">
                          <strong>{child.name}</strong>
                          <span>{child.birth_year} г.р.</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    "Нет детей"
                  )}
                </div>
                <div className="table-cell">
                  {user.children?.some((child) => child.branch_name) ? (
                    <div className="children-list">
                      {Array.from(
                        new Set(
                          user.children
                            .map((child) => child.branch_name)
                            .filter(Boolean),
                        ),
                      ).map((branchName) => (
                        <div key={branchName} className="child-item">
                          {branchName}
                        </div>
                      ))}
                    </div>
                  ) : (
                    "Не назначены"
                  )}
                </div>
                <div className="table-cell">
                  {user.registered_at
                    ? new Date(user.registered_at).toLocaleDateString("ru-RU")
                    : "Не указана"}
                </div>
                <div className="table-cell">
                  <div className="action-buttons">
                    <button
                      className="icon-btn small"
                      title="Редактировать"
                      onClick={() => handleEditUser(user)}
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      className="icon-btn small danger"
                      title="Удалить"
                      onClick={() => handleDeleteUser(user.id, user.name)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {renderPagination({
        page: usersPage,
        totalPages: usersTotalPages,
        onChange: setUsersPage,
        totalItems: sortedUsers.length,
        pageSize: USERS_PER_PAGE,
      })}
    </div>
  );

  const renderSettings = () => (
    <div className="settings-content odesk-viewFrame">
      <div className="section-header">
        <h2>Контент сайта</h2>
        <button
          className="primary-btn"
          onClick={handleSaveSiteContent}
          disabled={savingSiteContent}
        >
          <Save size={18} />
          {savingSiteContent ? "Сохранение..." : "Сохранить"}
        </button>
      </div>

      <div className="settings-card settings-card-wide export-settings-card">
        <div className="settings-card-header export-settings-header">
          <div className="export-settings-copy">
            <div className="export-settings-title-row">
              <FileText size={20} />
              <h3>Сводный Excel-файл</h3>
            </div>
            <p>
              Скачивает одну выгрузку со сводкой по пользователям, детям,
              оплатам, посещаемости, филиалам, расписанию и заявкам.
            </p>
            <div className="odesk-topbarMeta">
              <span className="odesk-pill">
                <Users size={16} />
                Родителей: {users.length}
              </span>
              <span className="odesk-pill">
                <Calendar size={16} />
                Детей: {totalChildrenCount}
              </span>
            </div>
          </div>
          <button
            className="primary-btn"
            onClick={handleDownloadReport}
            disabled={downloadingReport}
          >
            {downloadingReport ? (
              <Loader size={18} className="spin" />
            ) : (
              <Download size={18} />
            )}
            {downloadingReport ? "Подготовка..." : "Скачать Excel"}
          </button>
        </div>

        <div className="export-stats-grid">
          <div className="export-stat-card">
            <span className="export-stat-label">Пользователи</span>
            <strong className="export-stat-value">{users.length}</strong>
          </div>
          <div className="export-stat-card">
            <span className="export-stat-label">Дети</span>
            <strong className="export-stat-value">{totalChildrenCount}</strong>
          </div>
          <div className="export-stat-card">
            <span className="export-stat-label">Оплаты</span>
            <strong className="export-stat-value">{payments.length}</strong>
          </div>
          <div className="export-stat-card">
            <span className="export-stat-label">Подтверждено</span>
            <strong className="export-stat-value">
              {confirmedPaymentsCount}
            </strong>
          </div>
          <div className="export-stat-card">
            <span className="export-stat-label">Филиалы</span>
            <strong className="export-stat-value">{activeBranchesCount}</strong>
          </div>
          <div className="export-stat-card">
            <span className="export-stat-label">Расписания</span>
            <strong className="export-stat-value">{schedules.length}</strong>
          </div>
        </div>

        <div className="export-sheet-tags">
          {reportSheetLabels.map((label) => (
            <span key={label} className="export-sheet-tag">
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="settings-grid">
        <div className="settings-card">
          <h3>Контактная информация</h3>
          <div className="settings-list">
            <div className="setting-item">
              <label>Телефон</label>
              <input
                type="text"
                value={siteContent.contactInfo.phone}
                onChange={(e) =>
                  handleContactFieldChange("phone", e.target.value)
                }
              />
            </div>
            <div className="setting-item">
              <label>Email</label>
              <input
                type="email"
                value={siteContent.contactInfo.email}
                onChange={(e) =>
                  handleContactFieldChange("email", e.target.value)
                }
              />
            </div>
            <div className="setting-item">
              <label>Адрес</label>
              <input
                type="text"
                value={siteContent.contactInfo.address}
                onChange={(e) =>
                  handleContactFieldChange("address", e.target.value)
                }
              />
            </div>
            <div className="setting-item">
              <label>Режим работы</label>
              <input
                type="text"
                value={siteContent.contactInfo.working_hours}
                onChange={(e) =>
                  handleContactFieldChange("working_hours", e.target.value)
                }
              />
            </div>
          </div>
        </div>

        <div className="settings-card settings-card-wide">
          <div className="settings-card-header">
            <div className="payment-plan-settings-copy">
              <h3>Тарифы тренировок</h3>
              <p>
                Эти тарифы будут доступны в личном кабинете при создании
                оплаты.
              </p>
            </div>
            <button className="secondary-btn" onClick={handleAddPaymentPlan}>
              <Plus size={16} />
              Добавить тариф
            </button>
          </div>

          {paymentPlanCards.length === 0 ? (
            <div className="empty-state payment-plan-empty-state">
              <CreditCard size={42} />
              <p>Добавь первый тариф, чтобы он появился в личном кабинете и в оплатах.</p>
            </div>
          ) : (
            <div className="settings-list payment-plan-settings-list payment-plan-card-grid">
              {paymentPlanCards.map(({ plan, index }, cardIndex) => (
                <article
                  key={plan.id || `payment-plan-${index}`}
                  className="trainer-editor-card payment-plan-summary-card"
                >
                  <div className="payment-plan-summary-shell">
                    <div className="payment-plan-summary-head">
                      <div>
                        <h4>{plan.name?.trim() || `Тариф ${cardIndex + 1}`}</h4>
                        <p>
                          {plan.description?.trim()
                            ? plan.description.trim()
                            : "Описание тарифа пока не заполнено"}
                        </p>
                      </div>
                      <span className="payment-plan-summary-index">
                        {cardIndex + 1}
                      </span>
                    </div>

                    <div className="payment-plan-summary-metrics">
                      <div className="payment-plan-metric">
                        <span>Тренировок</span>
                        <strong>{plan.trainings || "—"}</strong>
                      </div>
                      <div className="payment-plan-metric">
                        <span>Стоимость</span>
                        <strong>{plan.price ? `${plan.price} ₽` : "—"}</strong>
                      </div>
                    </div>

                    <div className="payment-plan-summary-actions">
                      <button
                        className="secondary-btn"
                        onClick={() => openPaymentPlanModal(index)}
                      >
                        <Edit2 size={16} />
                        Редактировать
                      </button>
                      <button
                        className="danger-btn"
                        onClick={() => handleRemovePaymentPlan(index)}
                      >
                        <Trash2 size={16} />
                        Удалить
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="settings-list payment-plan-settings-list payment-plan-settings-list-legacy">
            {siteContent.paymentPlans.map((plan, index) => (
              <div
                key={plan.id || `payment-plan-${index}`}
                className="trainer-editor-card payment-plan-card"
              >
                <div className="form-row">
                  <div className="form-group">
                    <label>Название тарифа</label>
                    <input
                      type="text"
                      value={plan.name}
                      onChange={(e) =>
                        handlePaymentPlanFieldChange(
                          plan.id,
                          "name",
                          e.target.value,
                        )
                      }
                      placeholder="Например: Стандартный"
                    />
                  </div>
                  <div className="form-group payment-plan-number-group">
                    <label>Тренировок</label>
                    <input
                      type="number"
                      min="1"
                      value={plan.trainings}
                      onChange={(e) =>
                        handlePaymentPlanFieldChange(
                          plan.id,
                          "trainings",
                          e.target.value,
                        )
                      }
                      placeholder="8"
                    />
                  </div>
                  <div className="form-group payment-plan-number-group">
                    <label>Стоимость, ₽</label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={plan.price}
                      onChange={(e) =>
                        handlePaymentPlanFieldChange(
                          plan.id,
                          "price",
                          e.target.value,
                        )
                      }
                      placeholder="4000"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Описание</label>
                  <input
                    type="text"
                    value={plan.description}
                    onChange={(e) =>
                      handlePaymentPlanFieldChange(
                        plan.id,
                        "description",
                        e.target.value,
                      )
                    }
                    placeholder="Например: 2 тренировки в неделю"
                  />
                </div>

                <div className="payment-plan-preview">
                  <span className="payment-plan-chip">
                    <DollarSign size={15} />
                  </span>
                  <strong>{plan.name?.trim() || `Тариф ${index + 1}`}</strong>
                  <div className="payment-plan-preview-meta">
                    <span>{plan.trainings || "—"} трен.</span>
                    <span>{plan.price || "—"} ₽</span>
                  </div>
                </div>

                <div className="trainer-editor-actions">
                  <button
                    className="danger-btn"
                    onClick={() => handleRemovePaymentPlan(plan.id)}
                  >
                    <Trash2 size={16} />
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="settings-card settings-card-wide">
          <div className="settings-card-header">
            <h3>Тренеры</h3>
            <button className="secondary-btn" onClick={handleAddTrainer}>
              <Plus size={16} />
              Добавить тренера
            </button>
          </div>

          {trainerCards.length === 0 ? (
            <div className="empty-state trainer-empty-state">
              <Users size={42} />
              <p>Добавь первого тренера, чтобы карточки появились на сайте</p>
            </div>
          ) : (
            <div className="settings-list trainer-settings-list trainer-card-grid">
              {trainerCards.map(({ trainer, index }, cardIndex) => (
                <article
                  key={`trainer-card-${index}`}
                  className="trainer-editor-card trainer-summary-card"
                >
                  <div className="trainer-summary-shell">
                    <div className="trainer-summary-media">
                      {trainer.photo_data ? (
                        <img
                          src={trainer.photo_data}
                          alt={trainer.name || "Тренер"}
                          className="trainer-summary-photo"
                        />
                      ) : (
                        <div className="trainer-summary-placeholder">
                          <Users size={30} />
                        </div>
                      )}
                    </div>

                    <div className="trainer-summary-body">
                      <div className="trainer-summary-head">
                        <div>
                          <h4>{trainer.name || "Без имени"}</h4>
                          <p>{trainer.title || "Роль не указана"}</p>
                        </div>
                        <span className="trainer-summary-index">
                          {cardIndex + 1}
                        </span>
                      </div>

                      <p className="trainer-summary-text">
                        {trainer.description?.trim()
                          ? trainer.description.trim()
                          : "Описание пока не заполнено"}
                      </p>

                      <div className="trainer-summary-actions">
                        <button
                          className="secondary-btn"
                          onClick={() => openTrainerModal(index)}
                        >
                          <Edit2 size={16} />
                          Редактировать
                        </button>
                        <button
                          className="danger-btn"
                          onClick={() => handleRemoveTrainer(index)}
                        >
                          <Trash2 size={16} />
                          Удалить
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div
            className="settings-list trainer-settings-list trainer-settings-list-legacy"
            style={{ display: "none" }}
          >
            {siteContent.trainers.map((trainer, index) => (
              <div key={`trainer-${index}`} className="trainer-editor-card">
                <div className="trainer-photo-editor">
                  {trainer.photo_data ? (
                    <div className="trainer-photo-preview-wrapper">
                      <img
                        src={trainer.photo_data}
                        alt={trainer.name || "Предпросмотр тренера"}
                        className="trainer-photo-preview"
                      />
                      <button
                        type="button"
                        className="branch-photo-remove-btn"
                        onClick={() =>
                          handleTrainerFieldChange(index, "photo_data", "")
                        }
                      >
                        <Trash2 size={14} />
                        Удалить фото
                      </button>
                    </div>
                  ) : (
                    <div className="trainer-photo-placeholder">
                      <Users size={28} />
                      <span>Фотография тренера не выбрана</span>
                    </div>
                  )}

                  <label className="branch-photo-picker">
                    <Upload size={16} />
                    <span>
                      {trainer.photo_data ? "Заменить фото" : "Загрузить фото"}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={(e) =>
                        handleTrainerPhotoChange(index, e.target.files?.[0])
                      }
                    />
                  </label>
                  <p className="branch-photo-hint">
                    PNG, JPG, WEBP или GIF до 5 МБ
                  </p>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Имя</label>
                    <input
                      type="text"
                      value={trainer.name}
                      onChange={(e) =>
                        handleTrainerFieldChange(index, "name", e.target.value)
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Должность / роль</label>
                    <input
                      type="text"
                      value={trainer.title}
                      onChange={(e) =>
                        handleTrainerFieldChange(index, "title", e.target.value)
                      }
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Описание</label>
                  <textarea
                    value={trainer.description}
                    onChange={(e) =>
                      handleTrainerFieldChange(
                        index,
                        "description",
                        e.target.value,
                      )
                    }
                    rows={4}
                  />
                </div>
                <div className="trainer-editor-actions">
                  <button
                    className="danger-btn"
                    onClick={() => handleRemoveTrainer(index)}
                  >
                    <Trash2 size={16} />
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="settings-card settings-card-wide">
          <div className="settings-card-header">
            <h3>Достижения</h3>
            <button className="secondary-btn" onClick={handleAddAchievement}>
              <Plus size={16} />
              Добавить карточку
            </button>
          </div>

          <div className="settings-list">
            <div className="setting-item">
              <label>Заголовок вкладки</label>
              <input
                type="text"
                value={siteContent.achievements.title}
                onChange={(e) =>
                  handleAchievementsMetaChange("title", e.target.value)
                }
              />
            </div>
            <div className="setting-item achievement-intro-field">
              <label>Вступительный текст</label>
              <textarea
                value={siteContent.achievements.intro}
                onChange={(e) =>
                  handleAchievementsMetaChange("intro", e.target.value)
                }
                rows={4}
              />
            </div>

            <div className="settings-list achievement-settings-list">
              {siteContent.achievements.items.map((item, index) => (
                <div
                  key={`achievement-${index}`}
                  className="trainer-editor-card achievement-editor-card"
                >
                  <div className="form-row">
                    <div className="form-group achievement-value-group">
                      <label>Значение</label>
                      <input
                        type="text"
                        value={item.value}
                        onChange={(e) =>
                          handleAchievementFieldChange(
                            index,
                            "value",
                            e.target.value,
                          )
                        }
                        placeholder="Например: 350+"
                      />
                    </div>
                    <div className="form-group">
                      <label>Заголовок</label>
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) =>
                          handleAchievementFieldChange(
                            index,
                            "title",
                            e.target.value,
                          )
                        }
                        placeholder="Например: воспитанников"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Описание</label>
                    <textarea
                      value={item.description}
                      onChange={(e) =>
                        handleAchievementFieldChange(
                          index,
                          "description",
                          e.target.value,
                        )
                      }
                      rows={4}
                    />
                  </div>

                  <div className="trainer-editor-actions">
                    <button
                      className="danger-btn"
                      onClick={() => handleRemoveAchievement(index)}
                    >
                      <Trash2 size={16} />
                      Удалить
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="settings-card-header achievement-news-header">
              <h3>Новости для страницы достижений</h3>
              <button
                className="secondary-btn"
                onClick={handleAddAchievementNews}
              >
                <Plus size={16} />
                Добавить новость
              </button>
            </div>

            <div className="settings-list achievement-news-list">
              {siteContent.achievements.news.map((item, index) => (
                <div
                  key={`achievement-news-${index}`}
                  className="trainer-editor-card achievement-news-card"
                >
                  <div className="form-row">
                    <div className="form-group">
                      <label>Заголовок новости</label>
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) =>
                          handleAchievementNewsFieldChange(
                            index,
                            "title",
                            e.target.value,
                          )
                        }
                        placeholder="Например: Победа на городском турнире"
                      />
                    </div>
                    <div className="form-group achievement-date-group">
                      <label>Дата</label>
                      <input
                        type="date"
                        value={item.date}
                        onChange={(e) =>
                          handleAchievementNewsFieldChange(
                            index,
                            "date",
                            e.target.value,
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Рубрика</label>
                      <input
                        type="text"
                        value={item.tag}
                        onChange={(e) =>
                          handleAchievementNewsFieldChange(
                            index,
                            "tag",
                            e.target.value,
                          )
                        }
                        placeholder="Например: Турниры"
                      />
                    </div>
                    <div className="form-group">
                      <label>Короткое описание</label>
                      <input
                        type="text"
                        value={item.summary}
                        onChange={(e) =>
                          handleAchievementNewsFieldChange(
                            index,
                            "summary",
                            e.target.value,
                          )
                        }
                        placeholder="Короткий анонс новости"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Полный текст</label>
                    <textarea
                      value={item.content}
                      onChange={(e) =>
                        handleAchievementNewsFieldChange(
                          index,
                          "content",
                          e.target.value,
                        )
                      }
                      rows={5}
                    />
                  </div>

                  <div className="trainer-editor-actions">
                    <button
                      className="danger-btn"
                      onClick={() => handleRemoveAchievementNews(index)}
                    >
                      <Trash2 size={16} />
                      Удалить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {false && (
          <div className="settings-card settings-card-wide">
            <div className="settings-card-header">
              <h3>Администрация</h3>
              <button
                className="secondary-btn"
                onClick={handleAddAdministrationMember}
              >
                <Plus size={16} />
                Добавить сотрудника
              </button>
            </div>

            <div className="settings-list trainer-settings-list">
              {siteContent.administration.map((member, index) => (
                <div
                  key={`administration-${index}`}
                  className="trainer-editor-card"
                >
                  <div className="trainer-photo-editor">
                    {member.photo_data ? (
                      <div className="trainer-photo-preview-wrapper">
                        <img
                          src={member.photo_data}
                          alt={member.name || "Предпросмотр сотрудника"}
                          className="trainer-photo-preview"
                        />
                        <button
                          type="button"
                          className="branch-photo-remove-btn"
                          onClick={() =>
                            handleAdministrationFieldChange(
                              index,
                              "photo_data",
                              "",
                            )
                          }
                        >
                          <Trash2 size={14} />
                          Удалить фото
                        </button>
                      </div>
                    ) : (
                      <div className="trainer-photo-placeholder">
                        <Users size={28} />
                        <span>Фотография сотрудника не выбрана</span>
                      </div>
                    )}

                    <label className="branch-photo-picker">
                      <Upload size={16} />
                      <span>
                        {member.photo_data ? "Заменить фото" : "Загрузить фото"}
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={(e) =>
                          handleAdministrationPhotoChange(
                            index,
                            e.target.files?.[0],
                          )
                        }
                      />
                    </label>
                    <p className="branch-photo-hint">
                      PNG, JPG, WEBP или GIF до 5 МБ
                    </p>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Имя</label>
                      <input
                        type="text"
                        value={member.name}
                        onChange={(e) =>
                          handleAdministrationFieldChange(
                            index,
                            "name",
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Должность</label>
                      <input
                        type="text"
                        value={member.title}
                        onChange={(e) =>
                          handleAdministrationFieldChange(
                            index,
                            "title",
                            e.target.value,
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Email</label>
                      <input
                        type="email"
                        value={member.email}
                        onChange={(e) =>
                          handleAdministrationFieldChange(
                            index,
                            "email",
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Телефон</label>
                      <input
                        type="text"
                        value={member.phone}
                        onChange={(e) =>
                          handleAdministrationFieldChange(
                            index,
                            "phone",
                            e.target.value,
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Описание</label>
                    <textarea
                      value={member.description}
                      onChange={(e) =>
                        handleAdministrationFieldChange(
                          index,
                          "description",
                          e.target.value,
                        )
                      }
                      rows={4}
                    />
                  </div>

                  <div className="trainer-editor-actions">
                    <button
                      className="danger-btn"
                      onClick={() => handleRemoveAdministrationMember(index)}
                    >
                      <Trash2 size={16} />
                      Удалить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderPayments = () => (
    <div className="payments-content odesk-viewFrame">
      <div className="section-header">
        <h2>Управление оплатами</h2>
        <div className="filters-panel">
        <div className="filter-group">
          <label>Статус</label>
          <select
            value={paymentFilters.status}
            onChange={(e) =>
              setPaymentFilters((prev) => ({
                ...prev,
                status: e.target.value,
              }))
            }
          >
            <option value="all">Все статусы</option>
            <option value="confirmed">Подтверждено</option>
            <option value="pending">Ожидает</option>
            <option value="failed">Ошибка</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Пользователь</label>
          <select
            value={paymentFilters.userId}
            onChange={(e) =>
              setPaymentFilters((prev) => ({
                ...prev,
                userId: e.target.value,
              }))
            }
          >
            <option value="all">Все пользователи</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Филиал</label>
          <select
            value={paymentFilters.branchId}
            onChange={(e) =>
              setPaymentFilters((prev) => ({
                ...prev,
                branchId: e.target.value,
              }))
            }
          >
            <option value="all">Все филиалы</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>

        <div className="search-box search-box-compact">
          <Search size={16} />
          <input
            type="text"
            placeholder="Поиск по ID, родителю, ребенку или филиалу..."
            value={paymentSearchTerm}
            onChange={(e) => setPaymentSearchTerm(e.target.value)}
          />
        </div>

        <button className="secondary-btn" onClick={loadAllData}>
          <RefreshCw size={16} />
          Обновить
        </button>
      </div>
      </div>

      <div className="list-toolbar">
        <div className="list-toolbar-copy">
          <strong>{sortedPayments.length}</strong>
          <span>платежей после фильтрации</span>
        </div>
        <div className="sort-pills">
          <button
            type="button"
            className="sort-pill-button"
            onClick={() => handlePaymentSortChange("created_at")}
          >
            {renderSortButton(
              "По дате",
              paymentSort.field === "created_at",
              paymentSort.direction,
            )}
          </button>
          <button
            type="button"
            className="sort-pill-button"
            onClick={() => handlePaymentSortChange("amount")}
          >
            {renderSortButton(
              "По сумме",
              paymentSort.field === "amount",
              paymentSort.direction,
            )}
          </button>
          <button
            type="button"
            className="sort-pill-button"
            onClick={() => handlePaymentSortChange("remaining_trainings")}
          >
            {renderSortButton(
              "По остатку",
              paymentSort.field === "remaining_trainings",
              paymentSort.direction,
            )}
          </button>
          <button
            type="button"
            className="sort-pill-button"
            onClick={() => handlePaymentSortChange("user_name")}
          >
            {renderSortButton(
              "По родителю",
              paymentSort.field === "user_name",
              paymentSort.direction,
            )}
          </button>
        </div>
      </div>

      <div className="payments-table">
        <div className="payments-table-inner">
          <div className="table-header">
            <div className="header-cell">ID</div>
            <div className="header-cell">Пользователь</div>
            <div className="header-cell">Ребенок</div>
            <div className="header-cell">Филиал</div>
            <div className="header-cell">Сумма</div>
            <div className="header-cell">Тренировок</div>
            <div className="header-cell">Использовано</div>
            <div className="header-cell">Осталось</div>
            <div className="header-cell">Статус</div>
            <div className="header-cell">Дата</div>
            <div className="header-cell">Действия</div>
          </div>

          <div className="table-body">
            {sortedPayments.length === 0 ? (
              <div className="empty-state">
                <CreditCard size={48} />
                <p>Платежи не найдены</p>
              </div>
            ) : (
              paginatedPayments.map((payment) => (
                <div key={payment.id} className="table-row">
                  <div className="table-cell">#{payment.id}</div>
                  <div className="table-cell">{payment.user_name}</div>
                  <div className="table-cell">{payment.child_name}</div>
                  <div className="table-cell">{payment.branch_name}</div>
                  <div className="table-cell">{payment.amount} руб.</div>
                  <div className="table-cell">{payment.training_count}</div>
                  <div className="table-cell">{payment.used_trainings}</div>
                  <div className="table-cell">
                    {payment.remaining_trainings}
                  </div>
                  <div className="table-cell">
                    <div className={`status-badge ${payment.status}`}>
                      {payment.status === "confirmed"
                        ? "Подтвержден"
                        : payment.status === "pending"
                          ? "Ожидает"
                          : payment.status === "failed"
                            ? "Ошибка"
                            : payment.status}
                    </div>
                  </div>
                  <div className="table-cell">
                    {new Date(payment.created_at).toLocaleDateString("ru-RU")}
                  </div>
                  <div className="table-cell">
                    <div className="action-buttons">
                      {payment.status === "pending" && (
                        <button
                          className="small-btn success"
                          onClick={() =>
                            handleUpdatePaymentStatus(payment.id, "confirmed")
                          }
                          title="Подтвердить"
                        >
                          <Check size={12} />
                        </button>
                      )}
                      {payment.status === "confirmed" && (
                        <button
                          className="small-btn warning"
                          onClick={() =>
                            handleUpdatePaymentStatus(payment.id, "pending")
                          }
                          title="Отменить подтверждение"
                        >
                          <X size={12} />
                        </button>
                      )}
                      <button className="small-btn" title="Подробнее">
                        <Eye size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {renderPagination({
        page: paymentsPage,
        totalPages: paymentsTotalPages,
        onChange: setPaymentsPage,
        totalItems: sortedPayments.length,
        pageSize: PAYMENTS_PER_PAGE,
      })}
    </div>
  );

  const renderBranches = () => (
    <div className="branches-content odesk-viewFrame">
      <div className="section-header">
        <h2>Управление филиалами</h2>
        <button
          className="primary-btn"
          onClick={() => {
            resetBranchForm();
            setShowAddBranchModal(true);
          }}
        >
          <Plus size={20} />
          Добавить филиал
        </button>
      </div>

      <div className="branches-grid">
        {branches.map((branch) => (
          <div key={branch.id} className="branch-card">
            <div className="admin-branch-photo">
              {branch.photoData ? (
                <img
                  src={branch.photoData}
                  alt={branch.name}
                  className="admin-branch-photo-image"
                />
              ) : (
                <div className="admin-branch-photo-placeholder">
                  <Building size={36} />
                  <span>{branch.name}</span>
                </div>
              )}
            </div>
            <div className="branch-header">
              <div className="branch-status">
                <div className={`status-indicator ${branch.status}`} />
                <span className="status-text">
                  {branch.status === "active" ? "Активен" : "Неактивен"}
                </span>
              </div>
              <h3>{branch.name}</h3>
              <p className="branch-address">{branch.address}</p>
            </div>

            <div className="branch-info">
              <div className="info-item">
                <span className="info-label">Телефон:</span>
                <span>{branch.phone || "Не указан"}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Email:</span>
                <span>{branch.email || "Не указан"}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Расписаний:</span>
                <span>{branch.schedules || 0}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Вместимость:</span>
                <span>{branch.capacity || 30} детей</span>
              </div>
            </div>

            <div className="branch-actions">
              <button
                className="secondary-btn"
                onClick={() => handleEditBranch(branch)}
              >
                <Edit2 size={16} />
                Редактировать
              </button>
              <button
                className="danger-btn"
                onClick={() => handleDeleteBranch(branch.id)}
              >
                <Trash2 size={16} />
                Удалить
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ========== ГЛАВНЫЙ РЕНДЕР ==========

  return (
    <div className="adx-page">
      {/* Сайдбар */}
      <div className={`adx-sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="adx-sidebar-card">
          <div className="adx-brand">
            <div className="adx-brand-mark">
              <span>A</span>
            </div>
            <div className="adx-brand-copy">
              <h3>Администратор</h3>
              <p>ФШ Днепровец</p>
            </div>
          </div>

          <div className="adx-nav">
            <button
              className={`nav-item odesk-navItem ${
                activeView === "dashboard" ? "active" : ""
              }`}
              onClick={() => handleNavClick("dashboard")}
            >
              <BarChart3 size={20} />
              <span>Главная</span>
            </button>

            <button
              className={`nav-item odesk-navItem ${
                activeView === "schedule" ? "active" : ""
              }`}
              onClick={() => handleNavClick("schedule")}
            >
              <Calendar size={20} />
              <span>Расписание</span>
            </button>

            <button
              className={`nav-item odesk-navItem ${
                activeView === "calendar" ? "active" : ""
              }`}
              onClick={() => handleNavClick("calendar")}
            >
              <CalendarDays size={20} />
              <span>Календарь</span>
            </button>

            <button
              className={`nav-item odesk-navItem ${
                activeView === "users" ? "active" : ""
              }`}
              onClick={() => handleNavClick("users")}
            >
              <Users size={20} />
              <span>Пользователи</span>
            </button>

            <button
              className={`nav-item odesk-navItem ${
                activeView === "branches" ? "active" : ""
              }`}
              onClick={() => handleNavClick("branches")}
            >
              <Building size={20} />
              <span>Филиалы</span>
            </button>

            <button
              className={`nav-item odesk-navItem ${
                activeView === "payments" ? "active" : ""
              }`}
              onClick={() => handleNavClick("payments")}
            >
              <CreditCard size={20} />
              <span>Оплаты</span>
            </button>
            <button
              className={`nav-item odesk-navItem ${
                activeView === "settings" ? "active" : ""
              }`}
              onClick={() => handleNavClick("settings")}
            >
              <Settings size={20} />
              <span>Контент</span>
            </button>
          </div>

          <div className="sidebar-footer">
            <button className="adx-logout" onClick={handleLogout}>
              <LogOut size={20} />
              <span>Выйти</span>
            </button>
          </div>
        </div>
      </div>

      {/* Overlay для мобильного меню */}
      <div
        className={`adx-overlay ${sidebarOpen ? "is-open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Основной контент */}
      <div className="adx-main">
        <div className="adx-header">
          <div className="adx-header-left">
            <button
              className="adx-burger"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Menu size={24} />
            </button>
            <div className="adx-header-text">
              <h1>
                {activeView === "dashboard" && "Панель управления"}
                {activeView === "schedule" && "Управление расписанием"}
                {activeView === "calendar" && "Календарь"}
                {activeView === "users" && "Пользователи и дети"}
                {activeView === "branches" && "Филиалы"}
                {activeView === "payments" && "Оплаты"}
                {activeView === "settings" && "Контент сайта"}
              </h1>
              <p className="header-subtitle">
                {activeView === "dashboard" &&
                  "Обзор статистики и быстрые действия"}
                {activeView === "schedule" &&
                  "Создание и управление расписанием по годо-группам"}
                {activeView === "calendar" && "Просмотр расписания в календаре"}
                {activeView === "users" &&
                  "Управление родителями, пользователями и детьми"}
                {activeView === "branches" && "Управление филиалами центра"}
                {activeView === "payments" && "Просмотр и управление оплатами"}
                {activeView === "settings" &&
                  "Редактирование контактов и информации о тренерах"}
              </p>
              <div className="adx-header-meta">
                <span className="adx-pill">
                  <Users size={16} />
                  Родителей: {users.length}
                </span>
                <span className="adx-pill">
                  <Calendar size={16} />
                  Детей: {totalChildrenCount}
                </span>
              </div>
            </div>
          </div>
          <div className="adx-header-aside">
            <div className="adx-header-metrics">
              <article className="adx-header-metric">
                <strong>{activeBranchesCount}</strong>
                <span>Активных филиалов</span>
              </article>
              <article className="adx-header-metric">
                <strong>{confirmedPaymentsCount}</strong>
                <span>Подтвержденных оплат</span>
              </article>
            </div>
            <div className="header-actions">
              <button className="icon-btn" title="Уведомления">
                <AlertCircle size={20} />
              </button>
              <button className="icon-btn" title="Статистика">
                <BarChart3 size={20} />
              </button>
              <button
                className="adx-refresh"
                onClick={loadAllData}
                disabled={loading}
              >
                {loading ? (
                  <Loader size={20} className="spin" />
                ) : (
                  <RefreshCw size={20} />
                )}
                Обновить
              </button>
            </div>
          </div>
        </div>

        {isMobileViewport && (
          <div
            className="adx-mobile-nav"
            aria-label={`Разделы админки, текущий: ${activeViewConfig.title}`}
          >
            <div className="adx-mobile-current">{activeViewConfig.title}</div>
            <div className="adx-mobile-rail">
              {adminViewConfigs.map((view) => {
                const Icon = view.icon;
                return (
                  <button
                    key={view.id}
                    className={`adx-mobile-chip ${activeView === view.id ? "is-active" : ""}`}
                    onClick={() => handleNavClick(view.id)}
                  >
                    <Icon size={16} />
                    <span>{view.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <section className="adx-stage">
          {loading ? (
            <div className="adx-loading">
              <div className="spinner" />
              <p>Загрузка данных...</p>
            </div>
          ) : (
            <div className="adx-view">
              {activeView === "dashboard" && renderDashboard()}
              {activeView === "schedule" && renderScheduleManagement()}
              {activeView === "calendar" && renderCalendar()}
              {activeView === "users" && renderUsersView()}
              {activeView === "branches" && renderBranches()}
              {activeView === "payments" && renderPayments()}
              {activeView === "settings" && renderSettings()}
            </div>
          )}
        </section>
      </div>

      {/* Модальные окна */}
      {showAddScheduleModal && renderAddScheduleModal()}
      {showPaymentPlanModal && renderPaymentPlanModal()}
      {showTrainerModal && renderTrainerModal()}
      {showAddBranchModal && renderAddBranchModal()}
      {showEditBranchModal && renderEditBranchModal()}
      {showUserModal && renderUserModal()}
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

export default AdminDashboard;
