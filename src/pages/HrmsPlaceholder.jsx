import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import DateInput from "../components/common/DateInput";
import PasswordPromptModal from "../components/common/PasswordPromptModal";
import useSettings from "../hooks/useSettings";
import AppIcon from "../components/layout/AppIcon";
import {
  createHrmsEmployee,
  deleteHrmsEmployee,
  fetchHrmsEmployees,
  getHrmsEmployeeErrorMessage,
  updateHrmsEmployee,
} from "../services/hrmsEmployeesApi";
import {
  fetchHrmsAttendance,
  getHrmsAttendanceErrorMessage,
  saveHrmsAttendance,
} from "../services/hrmsAttendanceApi";
import {
  createHrmsReview,
  fetchHrmsReviews,
  getHrmsReviewErrorMessage,
} from "../services/hrmsReviewsApi";
import {
  createHrmsSalaryReassessment,
  deleteHrmsSalaryReassessment,
  fetchHrmsSalaryReassessments,
  getHrmsSalaryReassessmentErrorMessage,
  updateHrmsSalaryReassessment,
} from "../services/hrmsSalaryReassessmentsApi";
import {
  deleteHrmsSalaryBatch,
  fetchHrmsSalaryBatches,
  getHrmsSalaryErrorMessage,
  saveHrmsSalaryBatch,
} from "../services/hrmsSalariesApi";
import {
  createHrmsRelieving,
  fetchHrmsRelieving,
  getHrmsRelievingErrorMessage,
} from "../services/hrmsRelievingApi";
import {
  hasClosedPoAdminPassword,
  isAdminRole,
  verifyClosedPoAdminPassword,
} from "../utils/closedPoAuth";
import { parseDateValue } from "../utils/dateFormat";

const seedEmployees = [];

const HRMS_STORAGE_KEYS = {
  attendance: "hrms:attendance",
  employees: "hrms:employees",
  payroll: "hrms:payroll",
  relieving: "hrms:relieving",
  reports: "hrms:reports",
  reviews: "hrms:reviews",
  salaryHistory: "hrms:salary-history",
  session: "hrms:session",
};

const demoEmployeeFingerprints = new Set([
  "EMP001|John Doe|john.doe@mail.com",
  "EMP002|Jane Smith|jane.smith@mail.com",
  "EMP003|Michael Brown|michael.b@mail.com",
  "EMP004|Emily Davis|emily.davis@mail.com",
  "EMP005|David Wilson|david.wilson@mail.com",
]);

const removeDemoEmployees = (records = []) => {
  const cleanedRecords = records.filter((employee) => {
    const fingerprint = [
      employee.id,
      employee.name,
      employee.email,
    ].join("|");

    return !demoEmployeeFingerprints.has(fingerprint);
  });

  return cleanedRecords.length === records.length ? records : cleanedRecords;
};

const getHrmsEmployeeRecords = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (Array.isArray(value?.employees)) {
    return value.employees;
  }

  return [];
};

const readStoredList = (key, fallback = []) => {
  if (typeof window === "undefined") return fallback;

  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored);
    const records = Array.isArray(parsed) ? parsed : fallback;

    if (key !== HRMS_STORAGE_KEYS.employees) return records;

    const cleanedRecords = removeDemoEmployees(records);
    if (cleanedRecords.length !== records.length) {
      window.localStorage.setItem(key, JSON.stringify(cleanedRecords));
    }

    return cleanedRecords;
  } catch {
    return fallback;
  }
};

const writeStoredList = (key, value) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local storage can fail in private browsing or quota-limited contexts.
  }
};

const useStoredList = (key, fallback = []) => {
  const [items, setItems] = useState(() => readStoredList(key, fallback));

  const saveItems = useCallback((updater) => {
    setItems((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      writeStoredList(key, next);
      return next;
    });
  }, [key]);

  return [items, saveItems];
};

const useHrmsEmployees = () => {
  const [employees, saveEmployees] = useStoredList(
    HRMS_STORAGE_KEYS.employees,
    seedEmployees
  );
  const [apiState, setApiState] = useState({
    error: "",
    loading: true,
  });
  const cleanedEmployees = removeDemoEmployees(employees);

  useEffect(() => {
    if (cleanedEmployees.length !== employees.length) {
      saveEmployees(cleanedEmployees);
    }
  }, [cleanedEmployees, employees, saveEmployees]);

  const saveCleanEmployees = (updater) => {
    saveEmployees((current) => {
      const cleanedCurrent = removeDemoEmployees(current);
      const next =
        typeof updater === "function" ? updater(cleanedCurrent) : updater;
      return removeDemoEmployees(next);
    });
  };

  const refreshEmployees = useCallback(async () => {
    setApiState((current) => ({ ...current, loading: true }));

    try {
      const records = await fetchHrmsEmployees();
      const nextEmployees = removeDemoEmployees(getHrmsEmployeeRecords(records));
      saveEmployees(nextEmployees);
      setApiState({ error: "", loading: false });
      return nextEmployees;
    } catch (error) {
      setApiState({
        error: getHrmsEmployeeErrorMessage(
          error,
          "Could not load employees from the HRMS database."
        ),
        loading: false,
      });
      return null;
    }
  }, [saveEmployees]);

  useEffect(() => {
    let active = true;

    const loadEmployees = async () => {
      setApiState((current) => ({ ...current, loading: true }));

      try {
        const records = await fetchHrmsEmployees();
        if (!active) return;
        const nextEmployees = removeDemoEmployees(getHrmsEmployeeRecords(records));
        saveEmployees(nextEmployees);
        setApiState({ error: "", loading: false });
      } catch (error) {
        if (!active) return;
        setApiState({
          error: getHrmsEmployeeErrorMessage(
            error,
            "Could not load employees from the HRMS database."
          ),
          loading: false,
        });
      }
    };

    loadEmployees();

    if (typeof window !== "undefined") {
      window.addEventListener("hrms:employees:changed", loadEmployees);
    }

    return () => {
      active = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("hrms:employees:changed", loadEmployees);
      }
    };
  }, [saveEmployees]);

  return [
    cleanedEmployees,
    saveCleanEmployees,
    {
      ...apiState,
      refresh: refreshEmployees,
    },
  ];
};

const buildPageNumbers = (currentPage, totalPages) => {
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, Math.max(start + 4, currentPage));
  const normalizedStart = Math.max(1, end - 4);
  return Array.from(
    { length: end - normalizedStart + 1 },
    (_, index) => normalizedStart + index
  );
};

const useHrmsReviews = () => {
  const [reviews, setReviews] = useState([]);
  const [apiState, setApiState] = useState({
    error: "",
    loading: true,
  });

  const saveReviews = useCallback((updater) => {
    setReviews((current) =>
      typeof updater === "function" ? updater(current) : updater
    );
  }, []);

  const refreshReviews = useCallback(async () => {
    setApiState((current) => ({ ...current, loading: true }));

    try {
      const records = await fetchHrmsReviews();
      setReviews(records);
      setApiState({ error: "", loading: false });
      return records;
    } catch (error) {
      setApiState({
        error: getHrmsReviewErrorMessage(
          error,
          "Could not load reviews from the HRMS database."
        ),
        loading: false,
      });
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    const loadReviews = async () => {
      setApiState((current) => ({ ...current, loading: true }));

      try {
        const records = await fetchHrmsReviews();
        if (!active) return;
        setReviews(records);
        setApiState({ error: "", loading: false });
      } catch (error) {
        if (!active) return;
        setApiState({
          error: getHrmsReviewErrorMessage(
            error,
            "Could not load reviews from the HRMS database."
          ),
          loading: false,
        });
      }
    };

    loadReviews();

    if (typeof window !== "undefined") {
      window.addEventListener("hrms:reviews:changed", loadReviews);
    }

    return () => {
      active = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("hrms:reviews:changed", loadReviews);
      }
    };
  }, []);

  return [
    reviews,
    saveReviews,
    {
      ...apiState,
      refresh: refreshReviews,
    },
  ];
};

const useHrmsSalaryReassessments = () => {
  const [salaryReassessments, setSalaryReassessments] = useState([]);
  const [apiState, setApiState] = useState({
    error: "",
    loading: true,
  });

  const saveSalaryReassessments = useCallback((updater) => {
    setSalaryReassessments((current) =>
      typeof updater === "function" ? updater(current) : updater
    );
  }, []);

  const refreshSalaryReassessments = useCallback(async () => {
    setApiState((current) => ({ ...current, loading: true }));

    try {
      const records = await fetchHrmsSalaryReassessments();
      setSalaryReassessments(records);
      setApiState({ error: "", loading: false });
      return records;
    } catch (error) {
      setApiState({
        error: getHrmsSalaryReassessmentErrorMessage(
          error,
          "Could not load salary reassessments from the HRMS database."
        ),
        loading: false,
      });
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    const loadSalaryReassessments = async () => {
      setApiState((current) => ({ ...current, loading: true }));

      try {
        const records = await fetchHrmsSalaryReassessments();
        if (!active) return;
        setSalaryReassessments(records);
        setApiState({ error: "", loading: false });
      } catch (error) {
        if (!active) return;
        setApiState({
          error: getHrmsSalaryReassessmentErrorMessage(
            error,
            "Could not load salary reassessments from the HRMS database."
          ),
          loading: false,
        });
      }
    };

    loadSalaryReassessments();

    if (typeof window !== "undefined") {
      window.addEventListener(
        "hrms:salary-reassessments:changed",
        loadSalaryReassessments
      );
    }

    return () => {
      active = false;
      if (typeof window !== "undefined") {
        window.removeEventListener(
          "hrms:salary-reassessments:changed",
          loadSalaryReassessments
        );
      }
    };
  }, []);

  return [
    salaryReassessments,
    saveSalaryReassessments,
    {
      ...apiState,
      refresh: refreshSalaryReassessments,
    },
  ];
};

const useHrmsAttendance = () => {
  const [attendance, setAttendance] = useState([]);
  const [apiState, setApiState] = useState({
    error: "",
    loading: true,
  });

  const saveAttendanceRecords = useCallback((updater) => {
    setAttendance((current) =>
      typeof updater === "function" ? updater(current) : updater
    );
  }, []);

  const refreshAttendance = useCallback(async () => {
    setApiState((current) => ({ ...current, loading: true }));

    try {
      const records = await fetchHrmsAttendance();
      setAttendance(records);
      setApiState({ error: "", loading: false });
      return records;
    } catch (error) {
      setApiState({
        error: getHrmsAttendanceErrorMessage(
          error,
          "Could not load attendance from the HRMS database."
        ),
        loading: false,
      });
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    const loadAttendance = async () => {
      setApiState((current) => ({ ...current, loading: true }));

      try {
        const records = await fetchHrmsAttendance();
        if (!active) return;
        setAttendance(records);
        setApiState({ error: "", loading: false });
      } catch (error) {
        if (!active) return;
        setApiState({
          error: getHrmsAttendanceErrorMessage(
            error,
            "Could not load attendance from the HRMS database."
          ),
          loading: false,
        });
      }
    };

    loadAttendance();

    if (typeof window !== "undefined") {
      window.addEventListener("hrms:attendance:changed", loadAttendance);
    }

    return () => {
      active = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("hrms:attendance:changed", loadAttendance);
      }
    };
  }, []);

  return [
    attendance,
    saveAttendanceRecords,
    {
      ...apiState,
      refresh: refreshAttendance,
    },
  ];
};

const useHrmsSalaries = () => {
  const [salaryBatches, setSalaryBatches] = useState([]);
  const [apiState, setApiState] = useState({
    error: "",
    loading: true,
  });

  const saveSalaryBatches = useCallback((updater) => {
    setSalaryBatches((current) =>
      typeof updater === "function" ? updater(current) : updater
    );
  }, []);

  const refreshSalaryBatches = useCallback(async () => {
    setApiState((current) => ({ ...current, loading: true }));

    try {
      const records = await fetchHrmsSalaryBatches();
      setSalaryBatches(records);
      setApiState({ error: "", loading: false });
      return records;
    } catch (error) {
      setApiState({
        error: getHrmsSalaryErrorMessage(
          error,
          "Could not load salaries from the HRMS database."
        ),
        loading: false,
      });
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    const loadSalaryBatches = async () => {
      setApiState((current) => ({ ...current, loading: true }));

      try {
        const records = await fetchHrmsSalaryBatches();
        if (!active) return;
        setSalaryBatches(records);
        setApiState({ error: "", loading: false });
      } catch (error) {
        if (!active) return;
        setApiState({
          error: getHrmsSalaryErrorMessage(
            error,
            "Could not load salaries from the HRMS database."
          ),
          loading: false,
        });
      }
    };

    loadSalaryBatches();

    if (typeof window !== "undefined") {
      window.addEventListener("hrms:salaries:changed", loadSalaryBatches);
    }

    return () => {
      active = false;
      if (typeof window !== "undefined") {
        window.removeEventListener(
          "hrms:salaries:changed",
          loadSalaryBatches
        );
      }
    };
  }, []);

  return [
    salaryBatches,
    saveSalaryBatches,
    {
      ...apiState,
      refresh: refreshSalaryBatches,
    },
  ];
};

const useHrmsRelieving = () => {
  const [relievingRecords, setRelievingRecords] = useState([]);
  const [apiState, setApiState] = useState({
    error: "",
    loading: true,
  });

  const saveRelievingRecords = useCallback((updater) => {
    setRelievingRecords((current) =>
      typeof updater === "function" ? updater(current) : updater
    );
  }, []);

  const refreshRelievingRecords = useCallback(async () => {
    setApiState((current) => ({ ...current, loading: true }));

    try {
      const records = await fetchHrmsRelieving();
      setRelievingRecords(records);
      setApiState({ error: "", loading: false });
      return records;
    } catch (error) {
      setApiState({
        error: getHrmsRelievingErrorMessage(
          error,
          "Could not load relieving records from the HRMS database."
        ),
        loading: false,
      });
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    const loadRelievingRecords = async () => {
      setApiState((current) => ({ ...current, loading: true }));

      try {
        const records = await fetchHrmsRelieving();
        if (!active) return;
        setRelievingRecords(records);
        setApiState({ error: "", loading: false });
      } catch (error) {
        if (!active) return;
        setApiState({
          error: getHrmsRelievingErrorMessage(
            error,
            "Could not load relieving records from the HRMS database."
          ),
          loading: false,
        });
      }
    };

    loadRelievingRecords();

    if (typeof window !== "undefined") {
      window.addEventListener("hrms:relieving:changed", loadRelievingRecords);
    }

    return () => {
      active = false;
      if (typeof window !== "undefined") {
        window.removeEventListener(
          "hrms:relieving:changed",
          loadRelievingRecords
        );
      }
    };
  }, []);

  return [
    relievingRecords,
    saveRelievingRecords,
    {
      ...apiState,
      refresh: refreshRelievingRecords,
    },
  ];
};

const saveSession = (session) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      HRMS_STORAGE_KEYS.session,
      JSON.stringify(session)
    );
  } catch {
    // Ignore local storage failures.
  }
};

const createEmployeeId = (records) => {
  const maxNumber = records.reduce((max, employee) => {
    const match = String(employee.id || "").match(/^BE(\d+)$/i);
    return Math.max(max, match ? Number(match[1]) : 0);
  }, 0);

  return `BE${String(maxNumber + 1).padStart(2, "0")}`;
};

const getInitials = (name = "") =>
  String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "EM";

const todayValue = () => new Date().toISOString().slice(0, 10);

const padDatePart = (value) => String(value).padStart(2, "0");

const formatDate = (value) => {
  if (!value) return "";
  const text = String(value).trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }
  const dmyMatch = /^(\d{2})[-/](\d{2})[-/](\d{2,4})$/.exec(text);
  if (dmyMatch) {
    const year = dmyMatch[3].length === 2 ? `20${dmyMatch[3]}` : dmyMatch[3];
    return `${dmyMatch[1]}/${dmyMatch[2]}/${year}`;
  }
  const date = parseDateValue(text);
  if (!date || Number.isNaN(date.getTime())) {
    return value;
  }
  return `${padDatePart(date.getDate())}/${padDatePart(
    date.getMonth() + 1
  )}/${date.getFullYear()}`;
};

const formatDateTime = (value) => {
  if (!value) return "";
  const date = parseDateValue(value);
  if (!date || Number.isNaN(date.getTime())) {
    return formatDate(value);
  }
  return `${formatDate(date.toISOString())} ${date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

const monthNameFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

const getCurrentAttendanceMonth = () => monthNameFormatter.format(new Date());

const normalizeAttendanceMonth = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return "";

  const isoMatch = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(text);
  if (isoMatch) {
    return monthNameFormatter.format(
      new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, 1)
    );
  }

  const parsed = new Date(`1 ${text}`);
  if (!Number.isNaN(parsed.getTime())) {
    return monthNameFormatter.format(parsed);
  }

  return text;
};

const toAttendanceMonthInputValue = (value) => {
  const normalized = normalizeAttendanceMonth(value);
  if (!normalized) return "";

  const parsed = new Date(`1 ${normalized}`);
  if (Number.isNaN(parsed.getTime())) return "";

  return `${parsed.getFullYear()}-${padDatePart(parsed.getMonth() + 1)}`;
};

const getAttendanceMonthIndex = (value) => {
  const normalized = normalizeAttendanceMonth(value);
  const parsed = new Date(`1 ${normalized}`);
  if (Number.isNaN(parsed.getTime())) {
    return Number.NEGATIVE_INFINITY;
  }
  return parsed.getFullYear() * 12 + parsed.getMonth();
};

const areAttendanceMonthsEqual = (left, right) =>
  normalizeAttendanceMonth(left) === normalizeAttendanceMonth(right);

const getAttendanceMonthDate = (value) => {
  const normalized = normalizeAttendanceMonth(value);
  if (!normalized) return null;

  const parsed = new Date(`1 ${normalized}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getPayrollPaymentDate = (value) => {
  const monthDate = getAttendanceMonthDate(value);
  if (!monthDate) return "-";

  const lastDay = new Date(
    monthDate.getFullYear(),
    monthDate.getMonth() + 1,
    0
  );
  return `${padDatePart(lastDay.getDate())}/${padDatePart(
    lastDay.getMonth() + 1
  )}/${lastDay.getFullYear()}`;
};

const getAttendanceDays = (value) => {
  const monthDate = getAttendanceMonthDate(value);
  if (!monthDate) return [];

  const year = monthDate.getFullYear();
  const monthIndex = monthDate.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  return Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(year, monthIndex, index + 1);
    return {
      day: index + 1,
      iso: `${year}-${padDatePart(monthIndex + 1)}-${padDatePart(index + 1)}`,
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      weekday: date.toLocaleDateString("en-US", { weekday: "short" }),
    };
  });
};

const normalizeAttendanceStatusesForMonth = (statuses = [], monthValue) => {
  const days = getAttendanceDays(monthValue);
  const size = days.length || DEFAULT_ATTENDANCE_STATUSES.length;
  const source = Array.isArray(statuses) ? statuses : [];

  return Array.from({ length: size }, (_, index) => {
    const status = source[index] || DEFAULT_ATTENDANCE_STATUSES[index] || "P";
    return ["P", "A", "L", "H"].includes(status) ? status : "P";
  });
};

const toDateInputValue = (value = "") => {
  const text = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const match = text.match(/^(\d{2})[-/](\d{2})[-/](\d{2,4})$/);
  if (!match) return "";
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2]}-${match[1]}`;
};

const toIsoDateValue = (value = "") => {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const dmyValue = toDateInputValue(text);
  if (dmyValue) return dmyValue;

  const date = parseDateValue(text);
  return date && !Number.isNaN(date.getTime())
    ? `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(
        date.getDate()
      )}`
    : "";
};

const addDaysToIsoDate = (value, days) => {
  const isoValue = toIsoDateValue(value);
  if (!isoValue) return "";

  const [year, month, day] = isoValue.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(
    date.getDate()
  )}`;
};

const getYearEndDate = (value = todayValue()) => {
  const isoValue = toIsoDateValue(value) || todayValue();
  const year = Number(isoValue.slice(0, 4)) || new Date().getFullYear();
  return `${year}-12-31`;
};

const buildReviewPeriod = (startDate, endDate) => {
  if (!startDate && !endDate) return "";
  if (!startDate) return `Until ${formatDate(endDate)}`;
  if (!endDate) return `From ${formatDate(startDate)}`;
  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
};

const displayValue = (value) => {
  const text = String(value ?? "").trim();
  return text || "Not provided";
};

const maritalStatusOptions = ["Single", "Married", "Divorced", "Widowed"];
const bloodGroupOptions = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const buildEmployeeForm = (employee) => {
  const source = employee ?? {};
  const permanentAddress = source.permanentAddress || "";
  const presentAddress = source.presentAddress || source.address || "";
  const sameAsPermanentAddress =
    typeof source.sameAsPermanentAddress === "boolean"
      ? source.sameAsPermanentAddress
      : Boolean(
          permanentAddress &&
            presentAddress &&
            permanentAddress.trim() === presentAddress.trim()
        );

  return {
    address: presentAddress,
    bloodGroup: source.bloodGroup || "",
    dateOfBirth: toDateInputValue(source.dateOfBirth),
    department: source.department || "",
    designation: source.designation || "",
    documents: normalizeEmployeeDocuments(source.documents),
    email: source.email || "",
    emergencyContactAddress: source.emergencyContactAddress || "",
    emergencyContactName: source.emergencyContactName || "",
    emergencyContactNumber: source.emergencyContactNumber || "",
    emergencyContactRelation: source.emergencyContactRelation || "",
    fullName: source.name || "",
    gender: source.gender || "",
    joined: toDateInputValue(source.joined),
    manager: source.manager || "",
    maritalStatus: source.maritalStatus || "",
    nationality: source.nationality || "",
    panNumber: source.panNumber || "",
    documentNumber: source.documentNumber || "",
    permanentAddress,
    presentAddress,
    relation: source.relation || source.emergencyContactRelation || "",
    sameAsPermanentAddress,
    esiNumber: source.esiNumber || "",
    uanNumber: source.uanNumber || "",
    phone: source.phone || "",
    photo: source.photo || "",
    salary: String(source.salary || ""),
    allowances: String(source.allowances ?? source.allowance ?? ""),
    salaryDeduction: String(source.salaryDeduction ?? source.deduction ?? ""),
    pfAmount: String(source.pfAmount ?? source.providentFund ?? ""),
    professionalTax: String(source.professionalTax ?? source.pt ?? ""),
    tdsAmount: String(source.tdsAmount ?? source.tds ?? ""),
    esiAmount: String(source.esiAmount ?? source.esi ?? ""),
    status: source.status || "Active",
  };
};

const readProfilePhoto = (file) =>
  new Promise((resolve, reject) => {
    if (!file) {
      resolve("");
      return;
    }

    if (!file.type?.startsWith("image/")) {
      reject(new Error("Please upload a valid image file."));
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      reject(new Error("Profile picture must be 4 MB or smaller."));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxSize = 512;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");

        if (!context) {
          resolve(String(reader.result || ""));
          return;
        }

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      };
      image.onerror = () => resolve(String(reader.result || ""));
      image.src = String(reader.result || "");
    };

    reader.onerror = () =>
      reject(new Error("Could not read the selected profile picture."));
    reader.readAsDataURL(file);
  });

const employeeDocumentFields = [
  { key: "pan", label: "PAN", multiple: false },
  { key: "aadhaar", label: "Aadhar", multiple: false },
  { key: "offerLetter", label: "Offer Letter", multiple: false },
  { key: "uan", label: "UAN Number", multiple: false },
  { key: "esi", label: "ESI", multiple: false },
  { key: "certificate", label: "Certificates", multiple: true },
  {
    key: "additionalSpecialisationCertificates",
    label: "Additional Specialisation Certificates",
    multiple: true,
  },
  { key: "otherDocuments", label: "Other Documents", multiple: true },
];

const emptyEmployeeDocuments = () =>
  employeeDocumentFields.reduce((documents, field) => {
    documents[field.key] = [];
    return documents;
  }, {});

const normalizeEmployeeDocuments = (documents = {}) => {
  const source =
    documents && typeof documents === "object" && !Array.isArray(documents)
      ? documents
      : {};
  return employeeDocumentFields.reduce((normalized, field) => {
    const value = source[field.key];
    normalized[field.key] = Array.isArray(value)
      ? value.filter(Boolean)
      : value
        ? [value]
        : [];
    return normalized;
  }, {});
};

const readEmployeeDocumentFile = (file) =>
  new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      reject(new Error(`${file.name} must be 5 MB or smaller.`));
      return;
    }

    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        id: `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        size: file.size,
        type: file.type || "Document",
        uploadedAt: new Date().toISOString(),
        dataUrl: String(reader.result || ""),
      });
    reader.onerror = () =>
      reject(new Error(`Could not read ${file.name}. Please try again.`));
    reader.readAsDataURL(file);
  });

const validateEmployeeDocuments = ({ documents, panNumber, documentNumber }) => {
  const normalizedDocuments = normalizeEmployeeDocuments(documents);
  const allDocuments = Object.values(normalizedDocuments).flat();
  const invalidDocument = allDocuments.find(
    (document) =>
      !document ||
      !document.name ||
      !Number.isFinite(Number(document.size)) ||
      Number(document.size) <= 0 ||
      !document.dataUrl
  );

  if (invalidDocument) {
    return "One or more uploaded documents are incomplete. Please remove and upload them again.";
  }

  if (panNumber && !normalizedDocuments.pan.length) {
    return "Upload PAN document before saving employee details.";
  }

  if (documentNumber && !allDocuments.length) {
    return "Upload at least one document for the entered document number.";
  }

  return "";
};

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const printEmployeeProfile = (employee) => {
  if (typeof window === "undefined" || !employee) return;

  const printableRows = [
    ["Employee ID", displayValue(employee.id)],
    ["Name", displayValue(employee.name)],
    ["Department", displayValue(employee.department)],
    ["Designation", displayValue(employee.designation)],
    ["Email", displayValue(employee.email)],
    ["Phone", displayValue(employee.phone)],
    ["Emergency Contact Name", displayValue(employee.emergencyContactName)],
    ["Emergency Contact", displayValue(employee.emergencyContactNumber)],
    ["Relation", displayValue(employee.relation || employee.emergencyContactRelation)],
    [
      "Emergency Contact Address",
      displayValue(employee.emergencyContactAddress),
    ],
    ["Status", displayValue(employee.status)],
    ["Reporting To", displayValue(employee.manager)],
    ["Date of Joining", displayValue(employee.joined)],
    ["Date of Birth", displayValue(employee.dateOfBirth)],
    ["Marital Status", displayValue(employee.maritalStatus)],
    ["Nationality", displayValue(employee.nationality)],
    ["Blood Group", displayValue(employee.bloodGroup)],
    ["PAN Number", displayValue(employee.panNumber)],
    ["Document Number", displayValue(employee.documentNumber)],
    ["UAN Number", displayValue(employee.uanNumber)],
    ["ESI Number", displayValue(employee.esiNumber)],
    ["Gross Salary", money(employee.salary)],
    ["Monthly Salary", money(getSalaryBreakup(employee).monthlySalary)],
    ["Permanent Address", displayValue(employee.permanentAddress)],
    ["Present Address", displayValue(employee.presentAddress || employee.address)],
  ];
  const printWindow = window.open("", "_blank", "width=900,height=700");

  if (!printWindow) {
    window.print();
    return;
  }

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(employee.name)} - Employee Profile</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 32px;
            color: #0f172a;
            font-family: Arial, sans-serif;
            background: #ffffff;
          }
          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 24px;
            border-bottom: 2px solid #1d4ed8;
            padding-bottom: 18px;
          }
          h1 { margin: 0; font-size: 26px; }
          .muted { margin: 6px 0 0; color: #64748b; font-size: 13px; }
          .photo {
            width: 96px;
            height: 96px;
            border-radius: 999px;
            border: 1px solid #cbd5e1;
            object-fit: cover;
          }
          .initials {
            display: grid;
            width: 96px;
            height: 96px;
            place-items: center;
            border-radius: 999px;
            background: #0f172a;
            color: white;
            font-size: 26px;
            font-weight: 700;
          }
          table {
            width: 100%;
            margin-top: 28px;
            border-collapse: collapse;
            font-size: 14px;
          }
          th, td {
            border: 1px solid #e2e8f0;
            padding: 11px 12px;
            text-align: left;
            vertical-align: top;
          }
          th {
            width: 210px;
            background: #f8fafc;
            color: #475569;
          }
          .footer {
            margin-top: 40px;
            display: flex;
            justify-content: space-between;
            gap: 32px;
            color: #475569;
            font-size: 13px;
          }
          @media print {
            body { padding: 18px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <section class="header">
          <div>
            <h1>Employee Profile</h1>
            <p class="muted">Generated from HRMS database data</p>
          </div>
          ${
            employee.photo
              ? `<img class="photo" src="${employee.photo}" alt="${escapeHtml(
                  employee.name
                )}" />`
              : `<div class="initials">${escapeHtml(
                  employee.avatar || getInitials(employee.name)
                )}</div>`
          }
        </section>
        <table>
          <tbody>
            ${printableRows
              .map(
                ([label, value]) =>
                  `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(
                    value
                  )}</td></tr>`
              )
              .join("")}
          </tbody>
        </table>
        <section class="footer">
          <span>Prepared By: HRMS Admin</span>
          <span>Signature: __________________</span>
        </section>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => {
    printWindow.print();
  }, 250);
};

const getRelievingLetterData = (record = {}, employee = {}) => {
  const employeeName = displayValue(record.employeeName || employee.name);
  const employeeId = displayValue(record.employeeId || employee.id);
  const designation = displayValue(employee.designation);
  const department = displayValue(employee.department);
  const joinedDate = displayValue(employee.joined);
  const resignationDate = displayValue(record.resignationDate);
  const lastWorkingDate = displayValue(record.lastWorkingDate);
  const noticePeriod = displayValue(record.noticePeriod);
  const letterDate = formatDate(
    String(record.savedAt || todayValue()).slice(0, 10)
  );
  const referenceNo = String(record.id || `REL-${Date.now()}`).replace(
    "REL-",
    "RL-"
  );

  return {
    department,
    designation,
    employeeId,
    employeeName,
    joinedDate,
    lastWorkingDate,
    letterDate,
    noticePeriod,
    referenceNo,
    resignationDate,
    rows: [
      ["Reference No", referenceNo],
      ["Employee ID", employeeId],
      ["Employee Name", employeeName],
      ["Designation", designation],
      ["Department", department],
      ["Date of Joining", joinedDate],
      ["Resignation Date", resignationDate],
      ["Last Working Date", lastWorkingDate],
      ["Notice Period", noticePeriod],
    ],
    paragraphs: [
      `This is to certify that ${employeeName}, Employee ID ${employeeId}, was employed with Bangalore Electronics as ${designation} in the ${department} department.`,
      `Based on the approved exit formalities, ${employeeName} is relieved from duties with effect from the close of business on ${lastWorkingDate}.`,
      `The handover checklist and final settlement steps have been recorded in the HRMS relieving register for internal reference.`,
      `We thank ${employeeName} for the services rendered to the organization and wish continued success in future assignments.`,
    ],
  };
};

const printRelievingLetter = (record, employee) => {
  if (typeof window === "undefined" || !record) return;

  const letter = getRelievingLetterData(record, employee);
  const checklist = Array.isArray(record.checklist) ? record.checklist : [];
  const printWindow = window.open("", "_blank", "width=900,height=700");

  if (!printWindow) {
    window.print();
    return;
  }

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(letter.employeeName)} - Relieving Letter</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 34px;
            color: #0f172a;
            font-family: Arial, sans-serif;
            background: #ffffff;
            line-height: 1.6;
          }
          .letter {
            max-width: 820px;
            margin: 0 auto;
            border: 1px solid #cbd5e1;
            padding: 32px;
          }
          .header {
            display: flex;
            justify-content: space-between;
            gap: 24px;
            border-bottom: 2px solid #1d4ed8;
            padding-bottom: 18px;
          }
          h1 { margin: 0; font-size: 25px; }
          h2 { margin: 28px 0 18px; text-align: center; font-size: 21px; text-transform: uppercase; }
          .muted { margin: 5px 0 0; color: #64748b; font-size: 13px; }
          .meta {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 9px 22px;
            margin-top: 24px;
            font-size: 13px;
          }
          .label { color: #64748b; }
          p { font-size: 15px; margin: 16px 0; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 22px;
            font-size: 13px;
          }
          th, td {
            border: 1px solid #e2e8f0;
            padding: 9px 10px;
            text-align: left;
          }
          th { background: #f8fafc; color: #475569; }
          .signature {
            display: flex;
            justify-content: space-between;
            gap: 36px;
            margin-top: 54px;
            font-size: 13px;
          }
          .signature div {
            min-width: 220px;
            border-top: 1px solid #334155;
            padding-top: 8px;
          }
          @media print {
            body { padding: 0; }
            .letter { border: 0; }
          }
        </style>
      </head>
      <body>
        <article class="letter">
          <section class="header">
            <div>
              <h1>Bangalore Electronics</h1>
              <p class="muted">Human Resources Department</p>
            </div>
            <div>
              <p class="muted"><strong>Date:</strong> ${escapeHtml(letter.letterDate)}</p>
              <p class="muted"><strong>Ref:</strong> ${escapeHtml(letter.referenceNo)}</p>
            </div>
          </section>
          <h2>Relieving Letter</h2>
          <section class="meta">
            ${letter.rows
              .map(
                ([label, value]) => `
                  <div><span class="label">${escapeHtml(label)}:</span> ${escapeHtml(value)}</div>
                `
              )
              .join("")}
          </section>
          ${letter.paragraphs
            .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
            .join("")}
          <table>
            <thead>
              <tr>
                <th>Checklist Item</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${checklist
                .map(
                  (item) => `
                    <tr>
                      <td>${escapeHtml(item.label)}</td>
                      <td>${item.checked ? "Completed" : "Pending"}</td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
          <section class="signature">
            <div>Employee Signature</div>
            <div>Authorised HR Signatory</div>
          </section>
        </article>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => {
    printWindow.print();
  }, 250);
};

const cycleAttendanceStatus = (status) => {
  const order = ["P", "A", "L", "H"];
  const currentIndex = order.indexOf(status);
  return order[(currentIndex + 1) % order.length] || "P";
};

const DEFAULT_ATTENDANCE_STATUSES = [
  "P",
  "P",
  "P",
  "A",
  "P",
  "L",
  "H",
  "P",
  "P",
  "P",
  "P",
  "A",
  "P",
  "P",
  "P",
  "P",
  "P",
  "L",
  "P",
  "P",
  "P",
  "A",
  "P",
  "P",
  "P",
  "H",
  "P",
  "P",
  "P",
  "P",
  "P",
];

const statusClasses = {
  Active: "bg-emerald-50 text-emerald-700",
  Approved: "bg-emerald-50 text-emerald-700",
  Draft: "bg-slate-100 text-slate-700",
  "On Leave": "bg-rose-50 text-rose-700",
  Pending: "bg-amber-50 text-amber-700",
  Processed: "bg-emerald-50 text-emerald-700",
  Rejected: "bg-rose-50 text-rose-700",
  Relieved: "bg-slate-100 text-slate-700",
  "Revision Requested": "bg-amber-50 text-amber-700",
  "Salary Activated": "bg-blue-50 text-blue-700",
};

const money = (value) =>
  `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;

const toSalaryNumber = (value, fallback = 0) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const calculatePfAmount = (grossSalary) =>
  Math.round(toSalaryNumber(grossSalary) * 0.12);

const calculateEsiAmount = (grossSalary) =>
  Math.round(toSalaryNumber(grossSalary) * 0.015);

const calculateMonthlySalary = (grossSalary) =>
  Math.round(toSalaryNumber(grossSalary) / 12);

const getSalaryBreakup = (source = {}, grossOverride) => {
  const grossSalary = toSalaryNumber(
    grossOverride ?? source.salary ?? source.grossSalary ?? source.basicSalary
  );
  const allowances = toSalaryNumber(
    source.allowances ?? source.allowance ?? source.Allowances
  );
  const deduction = toSalaryNumber(
    source.salaryDeduction ?? source.deduction ?? source.SalaryDeduction
  );
  const tdsAmount = toSalaryNumber(
    source.tdsAmount ?? source.tds ?? source.TDSAmount
  );
  const professionalTax = toSalaryNumber(
    source.professionalTax ?? source.pt ?? source.ProfessionalTax
  );
  const pfAmount = toSalaryNumber(
    source.pfAmount ??
      source.providentFund ??
      source.PFAmount ??
      source.ProvidentFund,
    calculatePfAmount(grossSalary)
  );
  const esiAmount = toSalaryNumber(
    source.esiAmount ?? source.esi ?? source.ESIAmount,
    calculateEsiAmount(grossSalary)
  );
  const totalEarnings = grossSalary + allowances;
  const totalDeductions =
    deduction + pfAmount + esiAmount + tdsAmount + professionalTax;

  return {
    allowances,
    deduction,
    esiAmount,
    grossSalary,
    monthlySalary: calculateMonthlySalary(grossSalary),
    netSalary: totalEarnings - totalDeductions,
    pfAmount,
    professionalTax,
    tdsAmount,
    totalEarnings,
    totalDeductions,
  };
};

const getFormSalaryBreakup = (form = {}) => {
  const grossSalary = toSalaryNumber(form.salary);
  const allowances = toSalaryNumber(form.allowances);
  const deduction = toSalaryNumber(form.salaryDeduction);
  const tdsAmount = toSalaryNumber(form.tdsAmount);
  const professionalTax = toSalaryNumber(form.professionalTax);
  const pfAmount = toSalaryNumber(form.pfAmount, calculatePfAmount(grossSalary));
  const esiAmount = toSalaryNumber(form.esiAmount, calculateEsiAmount(grossSalary));
  const totalEarnings = grossSalary + allowances;
  const totalDeductions =
    deduction + pfAmount + esiAmount + tdsAmount + professionalTax;

  return {
    allowances,
    deduction,
    esiAmount,
    grossSalary,
    monthlySalary: calculateMonthlySalary(grossSalary),
    netSalary: totalEarnings - totalDeductions,
    pfAmount,
    professionalTax,
    tdsAmount,
    totalEarnings,
    totalDeductions,
  };
};

const clampNumber = (value, min = 0, max = 100) =>
  Math.min(max, Math.max(min, Number(value) || 0));

const averageScore = (values = []) => {
  const scores = values.map((value) => clampNumber(value));
  if (!scores.length) return 0;
  return Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
};

const scoreGrade = (score) => {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
};

const downloadTextFile = (filename, content, type = "text/plain") => {
  if (typeof window === "undefined") return;

  const blob = new Blob([content], { type });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
};

const Field = ({ label, children }) => (
  <label className="grid gap-1.5 text-xs font-semibold text-slate-700">
    {label}
    {children}
  </label>
);

const Input = ({ as: Component = "input", className = "", ...props }) => (
  <Component
    className={[
      "min-h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50 disabled:bg-slate-50",
      className,
    ]
      .filter(Boolean)
      .join(" ")}
    {...props}
  />
);

const Button = ({ children, variant = "primary", className = "", ...props }) => {
  const variants = {
    primary: "border-blue-700 bg-blue-700 text-white hover:bg-blue-800",
    danger: "border-rose-600 bg-rose-600 text-white hover:bg-rose-700",
    secondary: "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
    ghost: "border-transparent bg-transparent text-slate-600 hover:bg-slate-100",
  };

  return (
    <button
      type="button"
      className={[
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </button>
  );
};

const EmployeeDocumentsSection = ({ documents, onChange, onError }) => {
  const normalizedDocuments = normalizeEmployeeDocuments(documents);
  const uploadedCount = employeeDocumentFields.reduce(
    (count, field) => count + normalizedDocuments[field.key].length,
    0
  );

  const handleUpload = async (field, files) => {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;

    try {
      const uploadedDocuments = (
        await Promise.all(selectedFiles.map(readEmployeeDocumentFile))
      ).filter(Boolean);

      onChange({
        ...normalizedDocuments,
        [field.key]: field.multiple
          ? [...normalizedDocuments[field.key], ...uploadedDocuments]
          : uploadedDocuments.slice(0, 1),
      });
    } catch (uploadError) {
      onError(uploadError.message || "Document upload failed.");
    }
  };

  const removeDocument = (fieldKey, documentId) => {
    onChange({
      ...normalizedDocuments,
      [fieldKey]: normalizedDocuments[fieldKey].filter(
        (document) => document.id !== documentId
      ),
    });
  };

  return (
    <section className="rounded-xl border border-blue-100 bg-gradient-to-br from-white via-sky-50/50 to-emerald-50/40 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 pb-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-blue-700 text-white shadow-sm shadow-blue-100">
            <AppIcon name="folder" className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-slate-950">Documents</h2>
            <p className="text-xs font-semibold text-slate-500">
              Employee compliance and joining records
            </p>
          </div>
        </div>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
          {uploadedCount} uploaded
        </span>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {employeeDocumentFields.map((field) => (
          <div
            key={field.key}
            className="grid gap-3 rounded-lg border border-slate-200 bg-white/90 p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-800">{field.label}</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {field.multiple ? "Multiple files" : "Single file"}
                </p>
              </div>
              <span className="grid h-8 w-8 place-items-center rounded-md bg-sky-50 text-blue-700">
                <AppIcon name="upload" className="h-4 w-4" />
              </span>
            </div>
            <Input
              type="file"
              multiple={field.multiple}
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
              className="cursor-pointer bg-slate-50 px-2 py-2 text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-blue-700 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white hover:file:bg-blue-800"
              onChange={(event) => {
                handleUpload(field, event.target.files);
                event.target.value = "";
              }}
            />
            <div className="grid gap-2">
              {normalizedDocuments[field.key].length ? (
                normalizedDocuments[field.key].map((document) => (
                  <div
                    key={document.id || document.name}
                    className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white text-blue-700">
                        <AppIcon name="file" className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 truncate font-semibold text-slate-700">
                        {document.name}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-slate-500">
                      <span>{Math.ceil(Number(document.size || 0) / 1024)} KB</span>
                      <Button
                        variant="ghost"
                        className="min-h-7 px-2 text-xs text-rose-600 hover:bg-rose-50"
                        onClick={() => removeDocument(field.key, document.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <span className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-400">
                  No file uploaded
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

const EmployeeFormTabs = ({ tabs, activeTab, onChange, trailing }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
    <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
      {tabs.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={[
            "min-h-9 rounded-md px-4 text-sm font-bold transition",
            activeTab === item
              ? "bg-white text-blue-700 shadow-sm ring-1 ring-blue-100"
              : "text-slate-500 hover:bg-white/70 hover:text-slate-800",
          ].join(" ")}
        >
          {item}
        </button>
      ))}
    </div>
    {trailing}
  </div>
);

const Panel = ({ children, className = "", ...props }) => (
  <section
    className={[
      "rounded-lg border border-slate-200 bg-white p-4 shadow-sm",
      className,
    ]
      .filter(Boolean)
      .join(" ")}
    {...props}
  >
    {children}
  </section>
);

const RegisterDocumentView = ({
  title,
  subtitle,
  onClose,
  leftTitle = "Employee Details",
  leftRows = [],
  rightTitle = "Register Details",
  rightRows = [],
  tableColumns = [],
  tableRows = [],
  bottomLeftTitle = "Remarks",
  bottomLeftValue = "-",
  bottomRightTitle = "For HR Department",
  bottomRightValue = "Authorised Signatory",
}) => (
  <div className="border border-slate-800 text-xs text-slate-900">
    <div className="border-b border-slate-800 p-2">
      <div className="flex items-center justify-between gap-3 text-[11px] font-semibold tracking-wide">
        <span>{title}</span>
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-0.5 text-[10px] uppercase tracking-[0.3em] text-slate-600 border border-slate-300 rounded-full"
        >
          Close view
        </button>
      </div>
      {subtitle && <p className="mt-1 text-[11px] text-slate-500">{subtitle}</p>}
    </div>

    <div className="grid grid-cols-2 border-b border-slate-800">
      <div className="p-3 border-r border-slate-800">
        <p className="mb-2 font-semibold">{leftTitle}</p>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          {leftRows.map(([label, value]) => (
            <div key={label} className="contents">
              <p className="text-slate-600">{label}:</p>
              <p className="font-semibold whitespace-pre-line">{value || "-"}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="p-3">
        <p className="mb-2 font-semibold">{rightTitle}</p>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          {rightRows.map(([label, value]) => (
            <div key={label} className="contents">
              <p className="text-slate-600">{label}:</p>
              <p className="font-semibold whitespace-pre-line">{value || "-"}</p>
            </div>
          ))}
        </div>
      </div>
    </div>

    {tableColumns.length > 0 && (
      <table className="w-full text-[11px] border-b border-slate-800">
        <thead>
          <tr className="border-b border-slate-800">
            {tableColumns.map((column) => (
              <th key={column} className="p-2 text-left">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableRows.map((row, index) => (
            <tr key={row.id || index} className="border-b border-slate-200">
              {row.values.map((value, valueIndex) => (
                <td key={`${row.id || index}-${valueIndex}`} className="p-2">
                  {value || "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    )}

    <div className="grid grid-cols-2 border-b border-slate-800 text-[11px]">
      <div className="p-3 border-r border-slate-800">
        <p className="font-semibold">{bottomLeftTitle}</p>
        <p className="mt-1 whitespace-pre-line">{bottomLeftValue || "-"}</p>
      </div>
      <div className="p-3 text-right">
        <p className="font-semibold">{bottomRightTitle}</p>
        <div className="mt-8 border-t border-slate-700 pt-2">
          {bottomRightValue}
        </div>
      </div>
    </div>
  </div>
);

const Avatar = ({ initials, size = "md", src }) => {
  const sizes = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-20 w-20 text-xl",
  };

  return (
    <span
      className={[
        "inline-grid shrink-0 place-items-center rounded-full bg-slate-900 font-bold text-white",
        sizes[size],
      ].join(" ")}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        initials
      )}
    </span>
  );
};

const StatusBadge = ({ status }) => (
  <span
    className={[
      "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
      statusClasses[status] || "bg-slate-100 text-slate-600",
    ].join(" ")}
  >
    {status}
  </span>
);

const ScoreBar = ({ label, value, tone = "blue" }) => {
  const tones = {
    amber: "bg-amber-500",
    blue: "bg-blue-600",
    emerald: "bg-emerald-500",
    rose: "bg-rose-500",
    violet: "bg-violet-500",
  };
  const score = clampNumber(value);

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3 text-xs font-bold">
        <span className="text-slate-600">{label}</span>
        <span className="text-slate-900">{score}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${tones[tone] || tones.blue}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
};

const ScoreInput = ({ label, value, onChange }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-3">
    <ScoreBar label={label} value={value} />
    <Input
      type="range"
      min="0"
      max="100"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="mt-3 px-0"
    />
  </div>
);

const RadarChart = ({ metrics = [] }) => {
  const size = 220;
  const center = size / 2;
  const radius = 78;
  const safeMetrics = metrics.length ? metrics : [{ label: "Score", value: 0 }];
  const pointFor = (index, scale = 1) => {
    const angle = (Math.PI * 2 * index) / safeMetrics.length - Math.PI / 2;
    return [
      center + Math.cos(angle) * radius * scale,
      center + Math.sin(angle) * radius * scale,
    ];
  };
  const polygonPoints = safeMetrics
    .map((metric, index) =>
      pointFor(index, clampNumber(metric.value) / 100).join(",")
    )
    .join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-56 w-full">
      {[0.25, 0.5, 0.75, 1].map((scale) => (
        <polygon
          key={scale}
          points={safeMetrics.map((_, index) => pointFor(index, scale).join(",")).join(" ")}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="1"
        />
      ))}
      {safeMetrics.map((metric, index) => {
        const [x, y] = pointFor(index, 1.1);
        return (
          <text
            key={metric.label}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-slate-500 text-[9px] font-bold"
          >
            {metric.label}
          </text>
        );
      })}
      <polygon
        points={polygonPoints}
        fill="#2563eb"
        fillOpacity="0.16"
        stroke="#2563eb"
        strokeWidth="2"
      />
    </svg>
  );
};

const SalaryGrowthChart = ({ records = [], currentSalary = 0 }) => {
  const values = records.length
    ? records.map((record) => Number(record.revisedSalary || record.currentSalary || 0))
    : [Number(currentSalary || 0)];
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const width = 520;
  const height = 180;
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / Math.max(1, max - min)) * 130 - 25;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full">
      <path d="M0 155H520" stroke="#e2e8f0" />
      <polyline points={points} fill="none" stroke="#059669" strokeWidth="3" />
      {points.split(" ").map((point, index) => {
        const [x, y] = point.split(",");
        return (
          <g key={`${point}-${index}`}>
            <circle cx={x} cy={y} r="4" fill="#059669" />
            <text x={x} y={Number(y) - 10} textAnchor="middle" className="fill-slate-600 text-[11px] font-bold">
              {money(values[index])}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const Notice = ({ children, tone = "success" }) => {
  if (!children) return null;

  const tones = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
  };

  return (
    <div
      className={[
        "rounded-md border px-3 py-2 text-sm font-semibold",
        tones[tone] || tones.success,
      ].join(" ")}
    >
      {children}
    </div>
  );
};

const getHrmsAdminAuthError = (settings, password, actionLabel) => {
  if (!isAdminRole(settings)) {
    return `Only Admin users can ${actionLabel}.`;
  }
  if (!hasClosedPoAdminPassword(settings)) {
    return "Set the Closed PO Admin Password in Settings before approving employee edits or deletions.";
  }
  if (!verifyClosedPoAdminPassword(settings, password)) {
    return "Incorrect admin password.";
  }
  return "";
};

const HrmsShell = ({ children }) => {
  return (
    <div className="min-h-[calc(100vh-7rem)] rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-900 shadow-sm">
      {children}
    </div>
  );
};

const HrmsLoginPage = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });

  const handleSubmit = (event) => {
    event.preventDefault();
    saveSession({
      username: form.username || "admin",
      loggedInAt: new Date().toISOString(),
    });
    navigate("/dashboard");
  };

  return (
    <main className="grid min-h-screen bg-white text-slate-900 lg:grid-cols-2">
      <section className="relative flex min-h-[360px] items-center overflow-hidden bg-gradient-to-br from-blue-600 to-blue-300 p-8 text-white">
        <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-white/10" />
        <div className="absolute bottom-10 left-8 h-16 w-16 rounded-full bg-white/10" />
        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-bold">HRMS</h1>
          <p className="mt-3 text-xl font-semibold">
            Human Resource Management System
          </p>
          <div className="mt-10 grid max-w-sm grid-cols-[1fr_88px] items-end gap-4">
            <div className="rounded-lg bg-white/15 p-4 backdrop-blur">
              <div className="mb-4 flex items-center gap-3">
                <Avatar initials="HR" />
                <div className="h-2 flex-1 rounded-full bg-white/55" />
              </div>
              <div className="space-y-2">
                <div className="h-2 rounded-full bg-white/45" />
                <div className="h-2 w-3/4 rounded-full bg-white/35" />
              </div>
            </div>
            <div className="grid justify-items-center gap-2">
              <div className="h-16 w-16 rounded-full bg-slate-900" />
              <div className="h-24 w-20 rounded-t-full bg-blue-800" />
            </div>
          </div>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm"
        >
          <h2 className="text-center text-2xl font-bold text-slate-900">
            Welcome Back!
          </h2>
          <p className="mt-1 text-center text-sm text-slate-500">
            Please login to your account
          </p>

          <div className="mt-8 grid gap-4">
            <Field label="Username">
              <Input
                value={form.username}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    username: event.target.value,
                  }))
                }
                placeholder="Enter username"
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                placeholder="Enter password"
              />
            </Field>
            <Link
              to="/dashboard"
              className="justify-self-end text-xs font-semibold text-blue-700"
            >
              Forgot Password?
            </Link>
            <Button type="submit" className="w-full">
              Login
            </Button>
          </div>

          <p className="mt-8 text-center text-xs text-slate-400">
            2024 HRMS. All rights reserved.
          </p>
        </form>
      </section>
    </main>
  );
};

const DashboardPage = () => {
  const [storedEmployees] = useHrmsEmployees();
  const [reviews] = useStoredList(HRMS_STORAGE_KEYS.reviews, []);
  const [payroll] = useHrmsSalaries();
  const [relieving] = useHrmsRelieving();
  const totalEmployees = storedEmployees.length;
  const activeEmployees = storedEmployees.filter(
    (employee) => employee.status === "Active"
  ).length;
  const onLeaveEmployees = storedEmployees.filter(
    (employee) => employee.status === "On Leave"
  ).length;
  const relievedEmployees = storedEmployees.filter(
    (employee) => employee.status === "Relieved"
  ).length;
  const latestPayroll = payroll[0];
  const recentEmployee = storedEmployees[0];

  const stats = [
    { label: "Total Employees", value: totalEmployees, delta: "HRMS database" },
    { label: "Active Employees", value: activeEmployees, delta: "Live count" },
    { label: "On Leave", value: onLeaveEmployees, delta: "Live count" },
    { label: "Relieved", value: relievedEmployees, delta: "Live count" },
  ];

  return (
    <div className="grid gap-4">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <Panel key={item.label}>
            <p className="text-xs font-semibold text-slate-500">{item.label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{item.value}</p>
            <p className="mt-1 text-xs font-semibold text-blue-600">{item.delta}</p>
          </Panel>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Panel>
          <h2 className="text-sm font-bold">Monthly Attendance</h2>
          <div className="mt-4 flex items-center gap-5">
            <div
              className="grid h-28 w-28 place-items-center rounded-full"
              style={{
                background:
                  "conic-gradient(#2563eb 0 85%, #ef4444 85% 95%, #f59e0b 95% 100%)",
              }}
            >
              <div className="grid h-20 w-20 place-items-center rounded-full bg-white text-xl font-bold">
                85%
              </div>
            </div>
            <div className="grid gap-2 text-xs">
              {[
                ["Present", "85%", "bg-blue-600"],
                ["Absent", "10%", "bg-red-500"],
                ["Leave", "5%", "bg-amber-500"],
              ].map(([label, value, color]) => (
                <div key={label} className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${color}`} />
                  <span className="w-16 text-slate-600">{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel className="grid place-items-center text-center">
          <div>
            <h2 className="text-sm font-bold">Pending Reviews</h2>
            <p className="mt-7 text-4xl font-bold">
              {Math.max(0, totalEmployees - reviews.length)}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {reviews.length} reviews saved locally
            </p>
            <Link to="/reviews">
              <Button className="mt-4">View Reviews</Button>
            </Link>
          </div>
        </Panel>

        <Panel className="grid place-items-center text-center">
          <div>
            <h2 className="text-sm font-bold">Payroll Status</h2>
            <p className="mt-7 text-sm text-slate-500">
              {latestPayroll?.month || "May 2024"}
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">Completed</p>
            <Link to="/payroll">
              <Button className="mt-4">View Payroll</Button>
            </Link>
          </div>
        </Panel>
      </section>

      <Panel>
        <h2 className="text-sm font-bold">Recent Activities</h2>
        <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4 text-sm">
          <Avatar
            initials={recentEmployee?.avatar || "HR"}
            size="sm"
            src={recentEmployee?.photo}
          />
          <strong>{recentEmployee?.name || "No employees yet"}</strong>
          <span className="text-slate-500">
            {recentEmployee
              ? relieving.length
                ? "Relieving data saved"
                : reviews.length
                  ? "Review saved"
                  : "Employee data saved to HRMS database"
              : "Add employee details to start"}
          </span>
          <span className="ml-auto text-xs text-slate-400">
            {recentEmployee ? "HRMS DB" : ""}
          </span>
        </div>
      </Panel>
    </div>
  );
};

const EmployeeListPage = () => {
  const settings = useSettings();
  const isAdmin = String(settings?.profile?.role || "").toLowerCase() === "admin";
  const [employees, setEmployees, employeesState] = useHrmsEmployees();
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editingEmployeeId, setEditingEmployeeId] = useState("");
  const [authPrompt, setAuthPrompt] = useState(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordError, setAdminPasswordError] = useState("");

  const filteredEmployees = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return employees;
    return employees.filter((employee) =>
      [
        employee.id,
        employee.name,
        employee.department,
        employee.designation,
        employee.email,
        employee.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [query, employees]);

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredEmployees.length / pageSize));
  const safePage = Math.min(currentPage, pageCount);
  const pagedEmployees = filteredEmployees.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );
  const pageNumbers = buildPageNumbers(safePage, pageCount);
  const editingEmployee =
    employees.find((employee) => employee.id === editingEmployeeId) || null;

  useEffect(() => {
    setCurrentPage(1);
  }, [query]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(Math.max(page, 1), pageCount));
  }, [pageCount]);

  const closeAuthPrompt = () => {
    setAuthPrompt(null);
    setAdminPassword("");
    setAdminPasswordError("");
  };

  const requestEdit = (employee) => {
    if (!isAdmin) {
      setError("Only Admin users can edit employee details.");
      return;
    }
    setMessage("");
    setError("");
    setAuthPrompt({
      action: "edit",
      employeeId: employee.id,
      employeeName: employee.name,
    });
    setAdminPassword("");
    setAdminPasswordError("");
  };

  const requestDelete = (employee) => {
    if (!isAdmin) {
      setError("Only Admin users can delete employee details.");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete ${employee.name} (${employee.id})? This action requires admin approval and cannot be undone.`
    );

    if (!confirmed) return;

    setMessage("");
    setError("");
    setAuthPrompt({
      action: "delete",
      employeeId: employee.id,
      employeeName: employee.name,
    });
    setAdminPassword("");
    setAdminPasswordError("");
  };

  const confirmAdminAction = async () => {
    const actionLabel =
      authPrompt?.action === "delete"
        ? "delete employee records"
        : "edit employee details";
    const authError = getHrmsAdminAuthError(
      settings,
      adminPassword,
      actionLabel
    );

    if (authError) {
      setAdminPasswordError(authError);
      return;
    }

    if (!authPrompt?.employeeId) {
      closeAuthPrompt();
      return;
    }

    if (authPrompt.action === "edit") {
      setEditingEmployeeId(authPrompt.employeeId);
      closeAuthPrompt();
      return;
    }

    try {
      await deleteHrmsEmployee(authPrompt.employeeId);
      setEmployees((current) =>
        current.filter((record) => record.id !== authPrompt.employeeId)
      );
      if (editingEmployeeId === authPrompt.employeeId) {
        setEditingEmployeeId("");
      }
      setMessage(
        `${authPrompt.employeeName} deleted from HRMS database records.`
      );
      setError("");
      closeAuthPrompt();
    } catch (deleteError) {
      setAdminPasswordError(
        getHrmsEmployeeErrorMessage(
          deleteError,
          "Could not delete employee from the HRMS database."
        )
      );
    }
  };

  return (
    <Panel>
      <div className="mb-4 grid gap-2">
        <Notice>{message}</Notice>
        <Notice tone="warning">{error}</Notice>
        <Notice tone="warning">{employeesState.error}</Notice>
        <Notice>
          {employeesState.loading && !employees.length
            ? "Loading employees from HRMS database..."
            : ""}
        </Notice>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search employee..."
          className="sm:max-w-xs"
        />
        <Link to="/employees/add">
          <Button>
            <AppIcon name="plus" className="h-4 w-4" />
            Add Employee
          </Button>
        </Link>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-[820px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              {["ID", "Photo", "Name", "Department", "Designation", "Email", "Status", "Action"].map(
                (heading) => (
                  <th key={heading} className="px-3 py-3 font-bold">
                    {heading}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pagedEmployees.length ? (
              pagedEmployees.map((employee) => (
                <tr key={employee.id} className="hover:bg-slate-50">
                  <td className="px-3 py-3 font-semibold">{employee.id}</td>
                  <td className="px-3 py-3">
                    <Avatar
                      initials={employee.avatar}
                      size="sm"
                      src={employee.photo}
                    />
                  </td>
                  <td className="px-3 py-3">{employee.name}</td>
                  <td className="px-3 py-3">{employee.department}</td>
                  <td className="px-3 py-3">{employee.designation}</td>
                  <td className="px-3 py-3">{employee.email}</td>
                  <td className="px-3 py-3">
                    <StatusBadge status={employee.status} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        to={`/employees/profile/${employee.id}`}
                        aria-label={`View ${employee.name}`}
                      >
                        <Button className="min-h-8 px-2 text-xs" variant="secondary">
                          <AppIcon name="user" className="h-4 w-4" />
                          View
                        </Button>
                      </Link>
                      {isAdmin ? (
                        <>
                          <Button
                            className="min-h-8 px-2 text-xs"
                            variant="secondary"
                            onClick={() => requestEdit(employee)}
                            aria-label={`Edit ${employee.name}`}
                          >
                            <AppIcon name="edit" className="h-4 w-4" />
                            Edit
                          </Button>
                          <Button
                            className="min-h-8 px-2 text-xs"
                            variant="danger"
                            onClick={() => requestDelete(employee)}
                            aria-label={`Delete ${employee.name}`}
                          >
                            <AppIcon name="x" className="h-4 w-4" />
                            Delete
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  No employees match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Showing {pagedEmployees.length ? (safePage - 1) * pageSize + 1 : 0} - {safePage * pageSize > filteredEmployees.length ? filteredEmployees.length : safePage * pageSize} of {filteredEmployees.length} employees
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
            disabled={safePage <= 1}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          {pageNumbers.map((page) => (
            <button
              key={page}
              type="button"
              onClick={() => setCurrentPage(page)}
              className={
                page === safePage
                  ? "grid h-8 w-8 place-items-center rounded-md border border-blue-700 bg-blue-700 text-white text-xs font-bold"
                  : "grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:border-slate-300"
              }
            >
              {page}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCurrentPage(Math.min(pageCount, safePage + 1))}
            disabled={safePage >= pageCount}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {editingEmployee ? (
        <div className="mt-6 border-t border-slate-200 pt-6">
          <EmployeeEditor
            employee={editingEmployee}
            showHeading
            onCancel={() => {
              setEditingEmployeeId("");
              setAdminPassword("");
              setAdminPasswordError("");
            }}
            onSaved={(savedEmployee) => {
              setEditingEmployeeId("");
              setMessage(`${savedEmployee.name} updated in the HRMS database.`);
              setError("");
            }}
          />
        </div>
      ) : null}

      <PasswordPromptModal
        isOpen={Boolean(authPrompt)}
        title={
          authPrompt?.action === "delete"
            ? "Admin Approval Required"
            : "Verify Before Editing"
        }
        description={
          authPrompt?.action === "delete"
            ? `Enter the admin password to delete ${authPrompt?.employeeName || "this employee"}.`
            : `Enter the admin password to edit ${authPrompt?.employeeName || "this employee"}.`
        }
        password={adminPassword}
        error={adminPasswordError}
        confirmLabel={authPrompt?.action === "delete" ? "Approve Delete" : "Approve Edit"}
        onPasswordChange={(value) => {
          setAdminPassword(value);
          if (adminPasswordError) {
            setAdminPasswordError("");
          }
        }}
        onCancel={closeAuthPrompt}
        onConfirm={confirmAdminAction}
      />
    </Panel>
  );
};

const AddEmployeePage = () => {
  const [employees, setEmployees] = useHrmsEmployees();
  const navigate = useNavigate();
  const [tab, setTab] = useState("Personal Details");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => buildEmployeeForm());
  const tabs = ["Personal Details", "Employment Details", "Salary Details", "Documents"];
  const employeeId = useMemo(() => createEmployeeId(employees), [employees]);
  const updateForm = (field, value) => {
    setForm((current) => {
      const next = { ...current, [field]: value };

      if (field === "sameAsPermanentAddress") {
        next.sameAsPermanentAddress = Boolean(value);
        if (value) {
          next.presentAddress = current.permanentAddress;
          next.address = current.permanentAddress;
        }
      }

      if (field === "permanentAddress" && current.sameAsPermanentAddress) {
        next.presentAddress = value;
        next.address = value;
      }

      if (field === "presentAddress") {
        next.address = value;
        next.sameAsPermanentAddress =
          Boolean(current.permanentAddress.trim()) &&
          current.permanentAddress.trim() === String(value).trim();
      }

      return next;
    });
    setError("");
    setMessage("");
  };
  const handlePhotoUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const photo = await readProfilePhoto(file);
      updateForm("photo", photo);
      setMessage("Profile picture added. Save the employee to keep it.");
    } catch (uploadError) {
      setError(uploadError.message || "Profile picture upload failed.");
      event.target.value = "";
    }
  };

  const handleSave = async (event) => {
    event.preventDefault();

    if (!form.fullName.trim() || !form.email.trim() || !form.phone.trim()) {
      setError("Full name, email, and phone number are required.");
      return;
    }

    const normalizedPan = form.panNumber.trim().toUpperCase();
    if (normalizedPan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalizedPan)) {
      setError("PAN number must use the format AAAAA1234A.");
      return;
    }

    const documentError = validateEmployeeDocuments({
      documents: form.documents,
      documentNumber: form.documentNumber.trim(),
      panNumber: normalizedPan,
    });
    if (documentError) {
      setError(documentError);
      return;
    }

    const salaryBreakup = getFormSalaryBreakup(form);
    const newEmployee = {
      name: form.fullName.trim(),
      department: form.department,
      designation: form.designation,
      email: form.email.trim(),
      emergencyContactAddress: form.emergencyContactAddress.trim(),
      emergencyContactName: form.emergencyContactName.trim(),
      emergencyContactNumber: form.emergencyContactNumber.trim(),
      emergencyContactRelation: form.relation.trim(),
      relation: form.relation.trim(),
      panNumber: normalizedPan,
      documentNumber: form.documentNumber.trim(),
      esiNumber: form.esiNumber.trim(),
      uanNumber: form.uanNumber.trim(),
      phone: form.phone.trim(),
      status: form.status,
      manager: form.manager.trim(),
      joined: formatDate(form.joined),
      salary: salaryBreakup.grossSalary,
      allowances: salaryBreakup.allowances,
      salaryDeduction: salaryBreakup.deduction,
      pfAmount: salaryBreakup.pfAmount,
      professionalTax: salaryBreakup.professionalTax,
      tdsAmount: salaryBreakup.tdsAmount,
      esiAmount: salaryBreakup.esiAmount,
      avatar: getInitials(form.fullName),
      address: form.presentAddress.trim(),
      bloodGroup: form.bloodGroup,
      dateOfBirth: formatDate(form.dateOfBirth),
      gender: form.gender,
      maritalStatus: form.maritalStatus,
      nationality: form.nationality.trim(),
      permanentAddress: form.permanentAddress.trim(),
      photo: form.photo,
      presentAddress: form.presentAddress.trim(),
      sameAsPermanentAddress: form.sameAsPermanentAddress,
      documents: form.documents,
    };

    try {
      setSaving(true);
      const savedEmployee = await createHrmsEmployee(newEmployee);
      setEmployees((current) => [
        savedEmployee,
        ...current.filter((record) => record.id !== savedEmployee.id),
      ]);
      setMessage(
        `${savedEmployee.name} saved to HRMS database as ${savedEmployee.id}.`
      );
      window.setTimeout(() => navigate("/employees"), 450);
    } catch (saveError) {
      setError(
        getHrmsEmployeeErrorMessage(
          saveError,
          "Could not save employee to the HRMS database."
        )
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel>
      <div className="mb-4 grid gap-2">
        <Notice>{message}</Notice>
        <Notice tone="warning">{error}</Notice>
      </div>
      <EmployeeFormTabs tabs={tabs} activeTab={tab} onChange={setTab} />

      <form
        className="mt-5 grid gap-5"
        onSubmit={handleSave}
      >
        {tab === "Personal Details" && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_180px]">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full Name">
                <Input
                  value={form.fullName}
                  onChange={(event) => updateForm("fullName", event.target.value)}
                  placeholder="Enter full name"
                />
              </Field>
              <Field label="Employee ID">
                <Input value={employeeId} disabled />
              </Field>
              <Field label="Date of Birth">
                <DateInput
                  className="min-h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                  value={form.dateOfBirth}
                  onChange={(value) => updateForm("dateOfBirth", value)}
                />
              </Field>
              <Field label="Gender">
                <Input
                  as="select"
                  value={form.gender}
                  onChange={(event) => updateForm("gender", event.target.value)}
                >
                  <option value="" disabled>
                    Select Gender
                  </option>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </Input>
              </Field>
              <Field label="Nationality">
                <Input
                  value={form.nationality}
                  onChange={(event) => updateForm("nationality", event.target.value)}
                  placeholder="Enter nationality"
                />
              </Field>
              <Field label="Marital Status">
                <Input
                  as="select"
                  value={form.maritalStatus}
                  onChange={(event) => updateForm("maritalStatus", event.target.value)}
                >
                  <option value="">Select Marital Status</option>
                  {maritalStatusOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </Input>
              </Field>
              <Field label="Blood Group">
                <Input
                  as="select"
                  value={form.bloodGroup}
                  onChange={(event) => updateForm("bloodGroup", event.target.value)}
                >
                  <option value="">Select Blood Group</option>
                  {bloodGroupOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </Input>
              </Field>
              <Field label="Phone Number">
                <Input
                  value={form.phone}
                  onChange={(event) => updateForm("phone", event.target.value)}
                  placeholder="Enter phone number"
                />
              </Field>
              <Field label="Emergency Contact Name">
                <Input
                  value={form.emergencyContactName}
                  onChange={(event) =>
                    updateForm("emergencyContactName", event.target.value)
                  }
                  placeholder="Enter emergency contact name"
                />
              </Field>
              <Field label="Emergency Contact Number">
                <Input
                  value={form.emergencyContactNumber}
                  onChange={(event) =>
                    updateForm("emergencyContactNumber", event.target.value)
                  }
                  placeholder="Enter emergency contact number"
                />
              </Field>
              <Field label="Relation">
                <Input
                  value={form.relation}
                  onChange={(event) =>
                    updateForm("relation", event.target.value)
                  }
                  placeholder="Enter relation"
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(event) => updateForm("email", event.target.value)}
                  placeholder="Enter email"
                />
              </Field>
              <Field label="Emergency Contact Address">
                <Input
                  as="textarea"
                  rows={3}
                  value={form.emergencyContactAddress}
                  onChange={(event) =>
                    updateForm("emergencyContactAddress", event.target.value)
                  }
                  placeholder="Enter emergency contact address"
                  className="sm:col-span-2"
                />
              </Field>
              <Field label="Permanent Address">
                <Input
                  as="textarea"
                  rows={3}
                  value={form.permanentAddress}
                  onChange={(event) =>
                    updateForm("permanentAddress", event.target.value)
                  }
                  placeholder="Enter permanent address"
                  className="sm:col-span-2"
                />
              </Field>
              <Field label="Same as Permanent Address">
                <label className="flex min-h-10 items-center gap-3 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.sameAsPermanentAddress}
                    onChange={(event) =>
                      updateForm("sameAsPermanentAddress", event.target.checked)
                    }
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Use permanent address as present address</span>
                </label>
              </Field>
              <Field label="Present Address">
                <Input
                  as="textarea"
                  rows={3}
                  value={form.presentAddress}
                  onChange={(event) => updateForm("presentAddress", event.target.value)}
                  placeholder="Enter present address"
                  disabled={form.sameAsPermanentAddress}
                  className="sm:col-span-2"
                />
              </Field>
            </div>

            <div className="grid content-start gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-xs font-bold text-slate-700">Photo</p>
              <div className="grid aspect-square place-items-center rounded-md border border-slate-200 bg-white">
                <Avatar
                  initials={getInitials(form.fullName)}
                  size="lg"
                  src={form.photo}
                />
              </div>
              <Input type="file" accept="image/*" onChange={handlePhotoUpload} />
            </div>
          </div>
        )}

        {tab === "Employment Details" && (
          <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2">
            <Field label="Date of Joining">
              <DateInput
                className="min-h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                value={form.joined}
                onChange={(value) => updateForm("joined", value)}
              />
            </Field>
            <Field label="Reporting Manager">
              <Input
                value={form.manager}
                onChange={(event) => updateForm("manager", event.target.value)}
                placeholder="Enter reporting manager"
              />
            </Field>
            <Field label="Department">
              <Input
                as="select"
                value={form.department}
                onChange={(event) => updateForm("department", event.target.value)}
              >
                <option value="">Select Department</option>
                <option>IT</option>
                <option>HR</option>
                <option>Finance</option>
                <option>Marketing</option>
              </Input>
            </Field>
            <Field label="Designation">
              <Input
                value={form.designation}
                onChange={(event) => updateForm("designation", event.target.value)}
                placeholder="Enter designation"
              />
            </Field>
            <Field label="PAN Number">
              <Input
                value={form.panNumber}
                onChange={(event) => updateForm("panNumber", event.target.value.toUpperCase())}
                placeholder="Enter PAN number"
                maxLength={10}
              />
            </Field>
            <Field label="Document Number">
              <Input
                value={form.documentNumber}
                onChange={(event) => updateForm("documentNumber", event.target.value)}
                placeholder="Enter document number"
              />
            </Field>
            <Field label="UAN Number">
              <Input
                value={form.uanNumber}
                onChange={(event) => updateForm("uanNumber", event.target.value)}
                placeholder="Enter UAN number"
              />
            </Field>
            <Field label="ESI Number">
              <Input
                value={form.esiNumber}
                onChange={(event) => updateForm("esiNumber", event.target.value)}
                placeholder="Enter ESI number"
              />
            </Field>
            <Field label="Status">
              <Input
                as="select"
                value={form.status}
                onChange={(event) => updateForm("status", event.target.value)}
              >
                <option>Active</option>
                <option>On Leave</option>
              </Input>
            </Field>
          </div>
        )}

        {tab === "Salary Details" && (
          <div className="grid gap-4 rounded-lg border border-blue-100 bg-blue-50/40 p-4 sm:grid-cols-2">
            <Field label="Gross Salary">
              <Input
                type="number"
                min="0"
                value={form.salary}
                onChange={(event) => updateForm("salary", event.target.value)}
                placeholder="Enter gross salary"
              />
            </Field>
            <Field label="Monthly Salary">
              <Input value={money(getFormSalaryBreakup(form).monthlySalary)} disabled />
            </Field>
            <Field label="Allowances">
              <Input
                type="number"
                min="0"
                value={form.allowances}
                onChange={(event) => updateForm("allowances", event.target.value)}
                placeholder="Enter allowances"
              />
            </Field>
            <Field label="Deduction">
              <Input
                type="number"
                min="0"
                value={form.salaryDeduction}
                onChange={(event) =>
                  updateForm("salaryDeduction", event.target.value)
                }
                placeholder="Enter deduction"
              />
            </Field>
            <Field label="PF">
              <Input
                type="number"
                min="0"
                value={
                  form.pfAmount === ""
                    ? calculatePfAmount(form.salary)
                    : form.pfAmount
                }
                onChange={(event) => updateForm("pfAmount", event.target.value)}
              />
            </Field>
            <Field label="TDS">
              <Input
                type="number"
                min="0"
                value={form.tdsAmount}
                onChange={(event) => updateForm("tdsAmount", event.target.value)}
                placeholder="Enter TDS"
              />
            </Field>
            <Field label="Professional Tax (PT)">
              <Input
                type="number"
                min="0"
                value={form.professionalTax}
                onChange={(event) => updateForm("professionalTax", event.target.value)}
                placeholder="Enter PT"
              />
            </Field>
            <Field label="ESI Amount">
              <Input
                value={
                  form.esiAmount === ""
                    ? calculateEsiAmount(form.salary)
                    : form.esiAmount
                }
                disabled
              />
            </Field>
            <div className="flex items-center justify-between rounded-md border border-blue-200 bg-white px-4 py-3 text-sm font-bold text-blue-900 sm:col-span-2">
              <span>Net Salary</span>
              <span>{money(getFormSalaryBreakup(form).netSalary)}</span>
            </div>
          </div>
        )}

        {tab === "Documents" && (
          <EmployeeDocumentsSection
            documents={form.documents}
            onChange={(documents) => updateForm("documents", documents)}
            onError={setError}
          />
        )}

        <div className="flex justify-end gap-2 lg:col-span-2">
          <Button variant="secondary" onClick={() => navigate("/employees")}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save & Next"}
          </Button>
        </div>
      </form>
    </Panel>
  );
};

const EmployeeEditor = ({
  employee,
  onCancel,
  onSaved,
  showHeading = false,
}) => {
  const [tab, setTab] = useState("Personal Details");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [, setEmployees] = useHrmsEmployees();
  const [form, setForm] = useState(() => buildEmployeeForm(employee));
  const tabs = ["Personal Details", "Employment Details", "Salary Details", "Documents"];

  useEffect(() => {
    setForm(buildEmployeeForm(employee));
    setError("");
    setMessage("");
  }, [employee]);

  const updateForm = (field, value) => {
    setForm((current) => {
      const next = { ...current, [field]: value };

      if (field === "sameAsPermanentAddress") {
        next.sameAsPermanentAddress = Boolean(value);
        if (value) {
          next.presentAddress = current.permanentAddress;
          next.address = current.permanentAddress;
        }
      }

      if (field === "permanentAddress" && current.sameAsPermanentAddress) {
        next.presentAddress = value;
        next.address = value;
      }

      if (field === "presentAddress") {
        next.address = value;
        next.sameAsPermanentAddress =
          Boolean(current.permanentAddress.trim()) &&
          current.permanentAddress.trim() === String(value).trim();
      }

      return next;
    });
    setError("");
    setMessage("");
  };
  const handlePhotoUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const photo = await readProfilePhoto(file);
      updateForm("photo", photo);
      setMessage("Profile picture updated. Click Update Employee to save it.");
    } catch (uploadError) {
      setError(uploadError.message || "Profile picture upload failed.");
      event.target.value = "";
    }
  };

  const handleUpdate = async (event) => {
    event.preventDefault();

    if (!employee) {
      setError("No employee record found to update.");
      return;
    }

    if (!form.fullName.trim() || !form.email.trim() || !form.phone.trim()) {
      setError("Full name, email, and phone number are required.");
      return;
    }

    const normalizedPan = form.panNumber.trim().toUpperCase();
    if (normalizedPan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalizedPan)) {
      setError("PAN number must use the format AAAAA1234A.");
      return;
    }

    const documentError = validateEmployeeDocuments({
      documents: form.documents,
      documentNumber: form.documentNumber.trim(),
      panNumber: normalizedPan,
    });
    if (documentError) {
      setError(documentError);
      return;
    }

    const salaryBreakup = getFormSalaryBreakup(form);
    const updatedEmployee = {
      ...employee,
      name: form.fullName.trim(),
      department: form.department,
      designation: form.designation.trim(),
      email: form.email.trim(),
      emergencyContactAddress: form.emergencyContactAddress.trim(),
      emergencyContactName: form.emergencyContactName.trim(),
      emergencyContactNumber: form.emergencyContactNumber.trim(),
      emergencyContactRelation: form.relation.trim(),
      relation: form.relation.trim(),
      panNumber: normalizedPan,
      documentNumber: form.documentNumber.trim(),
      esiNumber: form.esiNumber.trim(),
      uanNumber: form.uanNumber.trim(),
      phone: form.phone.trim(),
      status: form.status,
      manager: form.manager.trim(),
      joined: formatDate(form.joined),
      salary: salaryBreakup.grossSalary,
      allowances: salaryBreakup.allowances,
      salaryDeduction: salaryBreakup.deduction,
      pfAmount: salaryBreakup.pfAmount,
      professionalTax: salaryBreakup.professionalTax,
      tdsAmount: salaryBreakup.tdsAmount,
      esiAmount: salaryBreakup.esiAmount,
      avatar: getInitials(form.fullName),
      address: form.presentAddress.trim(),
      bloodGroup: form.bloodGroup,
      dateOfBirth: formatDate(form.dateOfBirth),
      gender: form.gender,
      maritalStatus: form.maritalStatus,
      nationality: form.nationality.trim(),
      permanentAddress: form.permanentAddress.trim(),
      photo: form.photo,
      presentAddress: form.presentAddress.trim(),
      sameAsPermanentAddress: form.sameAsPermanentAddress,
      documents: form.documents,
    };

    try {
      setSaving(true);
      const savedEmployee = await updateHrmsEmployee(
        updatedEmployee.id,
        updatedEmployee
      );
      setEmployees((current) =>
        current.map((record) =>
          record.id === savedEmployee.id ? savedEmployee : record
        )
      );
      setMessage(`${savedEmployee.name} updated in the HRMS database.`);
      window.setTimeout(() => onSaved?.(savedEmployee), 450);
    } catch (saveError) {
      setError(
        getHrmsEmployeeErrorMessage(
          saveError,
          "Could not update employee in the HRMS database."
        )
      );
    } finally {
      setSaving(false);
    }
  };

  if (!employee) {
    return (
      <Panel>
        <Notice tone="warning">No employee record found to edit.</Notice>
        <Button className="mt-4" onClick={onCancel}>
          Back
        </Button>
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="mb-4 grid gap-2">
        {showHeading ? (
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Edit Employee
              </h2>
              <p className="text-sm text-slate-500">
                Update employee details directly from the employee list.
              </p>
            </div>
            <span className="text-xs font-bold text-slate-500">
              Editing {employee.id}
            </span>
          </div>
        ) : null}
        <Notice>{message}</Notice>
        <Notice tone="warning">{error}</Notice>
      </div>

      <EmployeeFormTabs
        tabs={tabs}
        activeTab={tab}
        onChange={setTab}
        trailing={
          showHeading ? null : (
            <span className="text-xs font-bold text-slate-500">
              Editing {employee.id}
            </span>
          )
        }
      />

      <form
        className="mt-5 grid gap-5"
        onSubmit={handleUpdate}
      >
        {tab === "Personal Details" && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_180px]">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full Name">
                <Input
                  value={form.fullName}
                  onChange={(event) => updateForm("fullName", event.target.value)}
                  placeholder="Enter full name"
                />
              </Field>
              <Field label="Employee ID">
                <Input value={employee.id} disabled />
              </Field>
              <Field label="Date of Birth">
                <DateInput
                  className="min-h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                  value={form.dateOfBirth}
                  onChange={(value) => updateForm("dateOfBirth", value)}
                />
              </Field>
              <Field label="Gender">
                <Input
                  as="select"
                  value={form.gender}
                  onChange={(event) => updateForm("gender", event.target.value)}
                >
                  <option value="">Select Gender</option>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </Input>
              </Field>
              <Field label="Nationality">
                <Input
                  value={form.nationality}
                  onChange={(event) => updateForm("nationality", event.target.value)}
                  placeholder="Enter nationality"
                />
              </Field>
              <Field label="Marital Status">
                <Input
                  as="select"
                  value={form.maritalStatus}
                  onChange={(event) => updateForm("maritalStatus", event.target.value)}
                >
                  <option value="">Select Marital Status</option>
                  {maritalStatusOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </Input>
              </Field>
              <Field label="Blood Group">
                <Input
                  as="select"
                  value={form.bloodGroup}
                  onChange={(event) => updateForm("bloodGroup", event.target.value)}
                >
                  <option value="">Select Blood Group</option>
                  {bloodGroupOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </Input>
              </Field>
              <Field label="Phone Number">
                <Input
                  value={form.phone}
                  onChange={(event) => updateForm("phone", event.target.value)}
                  placeholder="Enter phone number"
                />
              </Field>
              <Field label="Emergency Contact Name">
                <Input
                  value={form.emergencyContactName}
                  onChange={(event) =>
                    updateForm("emergencyContactName", event.target.value)
                  }
                  placeholder="Enter emergency contact name"
                />
              </Field>
              <Field label="Emergency Contact Number">
                <Input
                  value={form.emergencyContactNumber}
                  onChange={(event) =>
                    updateForm("emergencyContactNumber", event.target.value)
                  }
                  placeholder="Enter emergency contact number"
                />
              </Field>
              <Field label="Relation">
                <Input
                  value={form.relation}
                  onChange={(event) =>
                    updateForm("relation", event.target.value)
                  }
                  placeholder="Enter relation"
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(event) => updateForm("email", event.target.value)}
                  placeholder="Enter email"
                />
              </Field>
              <Field label="Emergency Contact Address">
                <Input
                  as="textarea"
                  rows={3}
                  value={form.emergencyContactAddress}
                  onChange={(event) =>
                    updateForm("emergencyContactAddress", event.target.value)
                  }
                  placeholder="Enter emergency contact address"
                  className="sm:col-span-2"
                />
              </Field>
              <Field label="Permanent Address">
                <Input
                  as="textarea"
                  rows={3}
                  value={form.permanentAddress}
                  onChange={(event) =>
                    updateForm("permanentAddress", event.target.value)
                  }
                  placeholder="Enter permanent address"
                  className="sm:col-span-2"
                />
              </Field>
              <Field label="Same as Permanent Address">
                <label className="flex min-h-10 items-center gap-3 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.sameAsPermanentAddress}
                    onChange={(event) =>
                      updateForm("sameAsPermanentAddress", event.target.checked)
                    }
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Use permanent address as present address</span>
                </label>
              </Field>
              <Field label="Present Address">
                <Input
                  as="textarea"
                  rows={3}
                  value={form.presentAddress}
                  onChange={(event) => updateForm("presentAddress", event.target.value)}
                  placeholder="Enter present address"
                  disabled={form.sameAsPermanentAddress}
                  className="sm:col-span-2"
                />
              </Field>
            </div>

            <div className="grid content-start gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-xs font-bold text-slate-700">Photo</p>
              <div className="grid aspect-square place-items-center rounded-md border border-slate-200 bg-white">
                <Avatar
                  initials={getInitials(form.fullName)}
                  size="lg"
                  src={form.photo}
                />
              </div>
              <Input type="file" accept="image/*" onChange={handlePhotoUpload} />
            </div>
          </div>
        )}

        {tab === "Employment Details" && (
          <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2">
            <Field label="Date of Joining">
              <DateInput
                className="min-h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                value={form.joined}
                onChange={(value) => updateForm("joined", value)}
              />
            </Field>
            <Field label="Reporting Manager">
              <Input
                value={form.manager}
                onChange={(event) => updateForm("manager", event.target.value)}
                placeholder="Enter reporting manager"
              />
            </Field>
            <Field label="Department">
              <Input
                as="select"
                value={form.department}
                onChange={(event) => updateForm("department", event.target.value)}
              >
                <option value="">Select Department</option>
                <option>IT</option>
                <option>HR</option>
                <option>Finance</option>
                <option>Marketing</option>
              </Input>
            </Field>
            <Field label="Designation">
              <Input
                value={form.designation}
                onChange={(event) => updateForm("designation", event.target.value)}
                placeholder="Enter designation"
              />
            </Field>
            <Field label="PAN Number">
              <Input
                value={form.panNumber}
                onChange={(event) => updateForm("panNumber", event.target.value.toUpperCase())}
                placeholder="Enter PAN number"
                maxLength={10}
              />
            </Field>
            <Field label="Document Number">
              <Input
                value={form.documentNumber}
                onChange={(event) => updateForm("documentNumber", event.target.value)}
                placeholder="Enter document number"
              />
            </Field>
            <Field label="UAN Number">
              <Input
                value={form.uanNumber}
                onChange={(event) => updateForm("uanNumber", event.target.value)}
                placeholder="Enter UAN number"
              />
            </Field>
            <Field label="ESI Number">
              <Input
                value={form.esiNumber}
                onChange={(event) => updateForm("esiNumber", event.target.value)}
                placeholder="Enter ESI number"
              />
            </Field>
            <Field label="Status">
              <Input
                as="select"
                value={form.status}
                onChange={(event) => updateForm("status", event.target.value)}
              >
                <option>Active</option>
                <option>On Leave</option>
                <option>Relieved</option>
              </Input>
            </Field>
          </div>
        )}

        {tab === "Salary Details" && (
          <div className="grid gap-4 rounded-lg border border-blue-100 bg-blue-50/40 p-4 sm:grid-cols-2">
            <Field label="Gross Salary">
              <Input
                type="number"
                min="0"
                value={form.salary}
                onChange={(event) => updateForm("salary", event.target.value)}
                placeholder="Enter gross salary"
              />
            </Field>
            <Field label="Monthly Salary">
              <Input value={money(getFormSalaryBreakup(form).monthlySalary)} disabled />
            </Field>
            <Field label="Allowances">
              <Input
                type="number"
                min="0"
                value={form.allowances}
                onChange={(event) => updateForm("allowances", event.target.value)}
                placeholder="Enter allowances"
              />
            </Field>
            <Field label="Deduction">
              <Input
                type="number"
                min="0"
                value={form.salaryDeduction}
                onChange={(event) =>
                  updateForm("salaryDeduction", event.target.value)
                }
                placeholder="Enter deduction"
              />
            </Field>
            <Field label="PF">
              <Input
                type="number"
                min="0"
                value={
                  form.pfAmount === ""
                    ? calculatePfAmount(form.salary)
                    : form.pfAmount
                }
                onChange={(event) => updateForm("pfAmount", event.target.value)}
              />
            </Field>
            <Field label="TDS">
              <Input
                type="number"
                min="0"
                value={form.tdsAmount}
                onChange={(event) => updateForm("tdsAmount", event.target.value)}
                placeholder="Enter TDS"
              />
            </Field>
            <Field label="Professional Tax (PT)">
              <Input
                type="number"
                min="0"
                value={form.professionalTax}
                onChange={(event) => updateForm("professionalTax", event.target.value)}
                placeholder="Enter PT"
              />
            </Field>
            <Field label="ESI Amount">
              <Input
                value={
                  form.esiAmount === ""
                    ? calculateEsiAmount(form.salary)
                    : form.esiAmount
                }
                disabled
              />
            </Field>
            <div className="flex items-center justify-between rounded-md border border-blue-200 bg-white px-4 py-3 text-sm font-bold text-blue-900 sm:col-span-2">
              <span>Net Salary</span>
              <span>{money(getFormSalaryBreakup(form).netSalary)}</span>
            </div>
          </div>
        )}

        {tab === "Documents" && (
          <EmployeeDocumentsSection
            documents={form.documents}
            onChange={(documents) => updateForm("documents", documents)}
            onError={setError}
          />
        )}

        <div className="flex justify-end gap-2 lg:col-span-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Updating..." : "Update Employee"}
          </Button>
        </div>
      </form>
    </Panel>
  );
};

const EditEmployeePage = () => {
  const settings = useSettings();
  const isAdmin = String(settings?.profile?.role || "").toLowerCase() === "admin";
  const { employeeId } = useParams();
  const [employees] = useHrmsEmployees();
  const navigate = useNavigate();
  const employee = useMemo(
    () => {
      if (employeeId) {
        return employees.find((record) => record.id === employeeId) || null;
      }
      return employees[0] || null;
    },
    [employeeId, employees]
  );

  if (!isAdmin) {
    return (
      <Panel>
        <Notice tone="warning">
          You do not have permission to edit employee records. Please contact an Admin.
        </Notice>
        <Button className="mt-4" onClick={() => navigate("/employees")}>
          Back to Employees
        </Button>
      </Panel>
    );
  }

  return (
    <EmployeeEditor
      employee={employee}
      onCancel={() => navigate("/employees")}
      onSaved={() => navigate("/employees")}
    />
  );
};

const EmployeeProfilePage = () => {
  const settings = useSettings();
  const isAdmin = String(settings?.profile?.role || "").toLowerCase() === "admin";
  const { employeeId } = useParams();
  const [employees, setEmployees, employeesState] = useHrmsEmployees();
  const [, setAttendanceRecords] = useStoredList(HRMS_STORAGE_KEYS.attendance, []);
  const [, setPayrollBatches] = useStoredList(HRMS_STORAGE_KEYS.payroll, []);
  const [, setRelievingRecords] = useStoredList(HRMS_STORAGE_KEYS.relieving, []);
  const [, setReviewRecords] = useStoredList(HRMS_STORAGE_KEYS.reviews, []);
  const [salaryHistory, setSalaryHistory, salaryReassessmentsState] =
    useHrmsSalaryReassessments();
  const navigate = useNavigate();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(
    employeeId || employees[0]?.id || ""
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [deletePromptOpen, setDeletePromptOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordError, setAdminPasswordError] = useState("");
  const employee = useMemo(() => {
    if (employeeId) {
      return employees.find((record) => record.id === selectedEmployeeId) || null;
    }
    return (
      employees.find((record) => record.id === selectedEmployeeId) ||
      employees[0] ||
      null
    );
  }, [employeeId, employees, selectedEmployeeId]);
  const filteredEmployees = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return employees;
    return employees.filter((record) =>
      [
        record.id,
        record.name,
        record.department,
        record.designation,
        record.email,
        record.phone,
        record.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [employees, searchQuery]);

  useEffect(() => {
    if (employeeId && employees.some((record) => record.id === employeeId)) {
      setSelectedEmployeeId(employeeId);
      setError("");
      return;
    }

    if (employeeId && !employeesState.loading) {
      const fallbackEmployeeId = employees[0]?.id || "";
      setSelectedEmployeeId(fallbackEmployeeId);
      setError(`Employee ${employeeId} was not found in the HRMS database.`);
      navigate(
        fallbackEmployeeId
          ? `/employees/profile/${fallbackEmployeeId}`
          : "/employees/profile",
        { replace: true }
      );
      return;
    }

    if (!selectedEmployeeId && employees[0]?.id) {
      setSelectedEmployeeId(employees[0].id);
    }
  }, [employeeId, employees, employeesState.loading, navigate, selectedEmployeeId]);

  const selectEmployee = (id) => {
    setSelectedEmployeeId(id);
    setMessage("");
    setError("");
    navigate(`/employees/profile/${id}`, { replace: true });
  };

  const deleteEmployee = async () => {
    if (!employee) return;

    if (!isAdmin) {
      setError("Only Admin users can delete employee records.");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete ${employee.name} (${employee.id})? This action requires admin approval and cannot be undone.`
    );

    if (!confirmed) return;

    setDeletePromptOpen(true);
    setAdminPassword("");
    setAdminPasswordError("");
  };

  const confirmDeleteEmployee = async () => {
    if (!employee) return;

    const authError = getHrmsAdminAuthError(
      settings,
      adminPassword,
      "delete employee records"
    );

    if (authError) {
      setAdminPasswordError(authError);
      return;
    }

    try {
      setError("");
      await deleteHrmsEmployee(employee.id);
    } catch (deleteError) {
      setError(
        getHrmsEmployeeErrorMessage(
          deleteError,
          "Could not delete employee from the HRMS database."
        )
      );
      return;
    }

    const nextEmployees = employees.filter((record) => record.id !== employee.id);
    setEmployees(nextEmployees);
    setAttendanceRecords((current) =>
      current.filter((record) => record.employeeId !== employee.id)
    );
    setReviewRecords((current) =>
      current.filter((record) => record.employeeId !== employee.id)
    );
    setSalaryHistory((current) =>
      current.filter((record) => record.employeeId !== employee.id)
    );
    setRelievingRecords((current) =>
      current.filter((record) => record.employeeId !== employee.id)
    );
    setPayrollBatches((current) =>
      current.map((batch) => ({
        ...batch,
        rows: (batch.rows || []).filter((row) => row.id !== employee.id),
      }))
    );
    const nextEmployeeId = nextEmployees[0]?.id || "";
    setSelectedEmployeeId(nextEmployeeId);
    setError("");
    setMessage(`${employee.name} deleted from HRMS database records.`);
    setDeletePromptOpen(false);
    setAdminPassword("");
    setAdminPasswordError("");
    navigate(
      nextEmployeeId ? `/employees/profile/${nextEmployeeId}` : "/employees/profile",
      { replace: true }
    );
  };

  if (!employee) {
    return (
      <Panel>
        <div className="grid gap-4">
          <Notice tone="warning">No employee records are available.</Notice>
          <div className="flex flex-wrap gap-2">
            <Link to="/employees/add">
              <Button>
                <AppIcon name="plus" className="h-4 w-4" />
                Add Employee
              </Button>
            </Link>
            <Link to="/employees">
              <Button variant="secondary">Back to Employee List</Button>
            </Link>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <div className="grid gap-4">
      <Panel>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Notice>{message}</Notice>
              <Notice tone="warning">
                {error || salaryReassessmentsState.error}
              </Notice>
              <Notice>
                {salaryReassessmentsState.loading && !salaryHistory.length
                  ? "Loading salary reassessments from HRMS database..."
                  : ""}
              </Notice>
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
              <Field label="Search Employee">
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by name, ID, department, phone..."
                />
              </Field>
              <Field label="Select Employee">
                <Input
                  as="select"
                  value={employee.id}
                  onChange={(event) => selectEmployee(event.target.value)}
                >
                  {filteredEmployees.map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.id} - {record.name}
                    </option>
                  ))}
                </Input>
              </Field>
            </div>
            {searchQuery && (
              <div className="flex flex-wrap gap-2">
                {filteredEmployees.length ? (
                  filteredEmployees.slice(0, 8).map((record) => (
                    <button
                      key={record.id}
                      type="button"
                      onClick={() => selectEmployee(record.id)}
                      className={[
                        "rounded-full border px-3 py-1.5 text-xs font-bold transition",
                        record.id === employee.id
                          ? "border-blue-700 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                      ].join(" ")}
                    >
                      {record.id} - {record.name}
                    </button>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">
                    No employees match your search.
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-end justify-start gap-2 xl:justify-end">
            {isAdmin ? (
              <>
                <Button variant="secondary" onClick={() => navigate("/employees")}>
                  <AppIcon name="table" className="h-4 w-4" />
                  Open Employee List
                </Button>
                <Button variant="danger" onClick={deleteEmployee}>
                  <AppIcon name="x" className="h-4 w-4" />
                  Delete Employee
                </Button>
              </>
            ) : (
              <span className="text-sm text-slate-500">
                Employee updates, delete actions, and print access are restricted to Admin.
              </span>
            )}
          </div>
        </div>
      </Panel>

      <div className="flex justify-end">
        {isAdmin ? (
          <Button onClick={() => printEmployeeProfile(employee)}>
            <AppIcon name="file" className="h-4 w-4" />
            Print
          </Button>
        ) : null}
      </div>

      <RegisterDocumentView
        title="EMPLOYEE PROFILE"
        subtitle={`${employee.name} | ${employee.id}`}
        onClose={() => navigate("/employees")}
        leftRows={[
          ["Employee", employee.name],
          ["Employee ID", employee.id],
          ["Department", displayValue(employee.department)],
          ["Designation", displayValue(employee.designation)],
          ["Status", displayValue(employee.status)],
        ]}
        rightRows={[
          ["Email", displayValue(employee.email)],
          ["Phone", displayValue(employee.phone)],
          ["Emergency Contact Name", displayValue(employee.emergencyContactName)],
          ["Emergency Contact", displayValue(employee.emergencyContactNumber)],
          ["Relation", displayValue(employee.relation || employee.emergencyContactRelation)],
          [
            "Emergency Contact Address",
            displayValue(employee.emergencyContactAddress),
          ],
          ["Reporting To", displayValue(employee.manager)],
          ["Joining Date", displayValue(employee.joined)],
          ["Gross Salary", money(employee.salary)],
          ["Monthly Salary", money(getSalaryBreakup(employee).monthlySalary)],
          ["PAN Number", displayValue(employee.panNumber)],
          ["Document Number", displayValue(employee.documentNumber)],
          ["UAN Number", displayValue(employee.uanNumber)],
          ["ESI Number", displayValue(employee.esiNumber)],
        ]}
        tableColumns={["Sl No", "Particulars", "Details"]}
        tableRows={[
          {
            id: "permanent-address",
            values: ["1", "Permanent Address", displayValue(employee.permanentAddress)],
          },
          {
            id: "present-address",
            values: [
              "2",
              "Present Address",
              displayValue(employee.presentAddress || employee.address),
            ],
          },
          { id: "dob", values: ["3", "Date of Birth", displayValue(employee.dateOfBirth)] },
          { id: "gender", values: ["4", "Gender", displayValue(employee.gender)] },
          {
            id: "marital",
            values: ["5", "Marital Status", displayValue(employee.maritalStatus)],
          },
          { id: "nationality", values: ["6", "Nationality", displayValue(employee.nationality)] },
          { id: "blood", values: ["7", "Blood Group", displayValue(employee.bloodGroup)] },
        ]}
        bottomLeftTitle="Employee Notes"
        bottomLeftValue="Registered employee details from HRMS database records."
      />

      <PasswordPromptModal
        isOpen={deletePromptOpen}
        title="Admin Approval Required"
        description={`Enter the admin password to delete ${employee?.name || "this employee"}.`}
        password={adminPassword}
        error={adminPasswordError}
        confirmLabel="Approve Delete"
        onPasswordChange={(value) => {
          setAdminPassword(value);
          if (adminPasswordError) {
            setAdminPasswordError("");
          }
        }}
        onCancel={() => {
          setDeletePromptOpen(false);
          setAdminPassword("");
          setAdminPasswordError("");
        }}
        onConfirm={confirmDeleteEmployee}
      />
    </div>
  );
};

const ReviewsPage = () => {
  const settings = useSettings();
  const role = String(settings?.profile?.role || "").toLowerCase();
  const canAddReview = ["admin", "hr manager", "manager"].includes(role);
  const [employees] = useHrmsEmployees();
  const [reviews, setReviews, reviewsState] = useHrmsReviews();
  const [salaryAssessments, , salaryAssessmentsState] =
    useHrmsSalaryReassessments();
  const currentReviewYear = new Date().getFullYear();
  const [rating, setRating] = useState(4);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeReviewId, setActiveReviewId] = useState("");
  const [manualReviewPeriod, setManualReviewPeriod] = useState(false);
  const [form, setForm] = useState({
    comments: "",
    employeeId: employees[0]?.id || "",
    improvement: "",
    period: buildReviewPeriod(`${currentReviewYear}-01-01`, `${currentReviewYear}-12-31`),
    reviewDate: todayValue(),
    reviewEndDate: `${currentReviewYear}-12-31`,
    reviewStartDate: `${currentReviewYear}-01-01`,
    reviewer: "",
    strengths: "",
    type: "Manual",
  });
  const selectedEmployee =
    employees.find((employee) => employee.id === form.employeeId) || null;
  const reviewRows = useMemo(
    () =>
      [...reviews].sort((first, second) =>
        String(second.savedAt || "").localeCompare(String(first.savedAt || ""))
      ),
    [reviews]
  );
  const activeReviewRecord =
    reviewRows.find((record) => record.id === activeReviewId) || null;
  const previousReviewCycle = useMemo(() => {
    if (!form.employeeId) return null;

    const reviewCycles = reviews
      .filter((record) => record.employeeId === form.employeeId)
      .map((record) => ({
        date:
          toIsoDateValue(record.reviewEndDate) ||
          toIsoDateValue(record.reviewDate) ||
          toIsoDateValue(record.savedAt),
        endDate:
          toIsoDateValue(record.reviewEndDate) ||
          toIsoDateValue(record.reviewDate) ||
          toIsoDateValue(record.savedAt),
        label: record.period || "Previous review",
        type: "Review",
      }));
    const salaryCycles = salaryAssessments
      .filter((record) => record.employeeId === form.employeeId)
      .map((record) => ({
        date:
          toIsoDateValue(record.effectiveDate) ||
          toIsoDateValue(record.reviewDate) ||
          toIsoDateValue(record.savedAt),
        endDate:
          toIsoDateValue(record.effectiveDate) ||
          toIsoDateValue(record.reviewDate) ||
          toIsoDateValue(record.savedAt),
        label: record.reviewPeriod || "Salary assessment",
        type: "Salary Assessment",
      }));

    return [...reviewCycles, ...salaryCycles]
      .filter((record) => record.date)
      .sort((first, second) => String(second.date).localeCompare(String(first.date)))[0] || null;
  }, [form.employeeId, reviews, salaryAssessments]);
  const reviewPeriodSuggestion = useMemo(() => {
    const startDate = previousReviewCycle?.endDate
      ? addDaysToIsoDate(previousReviewCycle.endDate, 1)
      : `${currentReviewYear}-01-01`;
    const endDate = getYearEndDate(startDate);

    return {
      endDate,
      period: buildReviewPeriod(startDate, endDate),
      startDate,
    };
  }, [currentReviewYear, previousReviewCycle]);

  useEffect(() => {
    if (!form.employeeId && employees[0]?.id) {
      setForm((current) => ({ ...current, employeeId: employees[0].id }));
    }
  }, [employees, form.employeeId]);

  useEffect(() => {
    if (!form.employeeId || manualReviewPeriod) return;

    setForm((current) => {
      if (
        current.reviewStartDate === reviewPeriodSuggestion.startDate &&
        current.reviewEndDate === reviewPeriodSuggestion.endDate &&
        current.period === reviewPeriodSuggestion.period
      ) {
        return current;
      }

      return {
        ...current,
        period: reviewPeriodSuggestion.period,
        reviewEndDate: reviewPeriodSuggestion.endDate,
        reviewStartDate: reviewPeriodSuggestion.startDate,
      };
    });
  }, [
    form.employeeId,
    manualReviewPeriod,
    reviewPeriodSuggestion.endDate,
    reviewPeriodSuggestion.period,
    reviewPeriodSuggestion.startDate,
  ]);

  const updateForm = (field, value) => {
    if (field === "employeeId") {
      setManualReviewPeriod(false);
    }
    setForm((current) => ({ ...current, [field]: value }));
    setMessage("");
    setError("");
  };

  const updateReviewPeriodDate = (field, value) => {
    setManualReviewPeriod(true);
    setForm((current) => {
      const next = { ...current, [field]: value };
      return {
        ...next,
        period: buildReviewPeriod(next.reviewStartDate, next.reviewEndDate),
      };
    });
    setMessage("");
    setError("");
  };

  const saveReview = async (event) => {
    event.preventDefault();

    if (!canAddReview) {
      setError("Only Admin, HR Manager, or Manager roles can add reviews.");
      return;
    }

    if (!selectedEmployee) {
      setError("Add an employee before saving a review.");
      return;
    }

    if (!form.reviewStartDate || !form.reviewEndDate || !form.reviewDate) {
      setError("Select review start date, end date, and review date before saving.");
      return;
    }

    if (form.reviewEndDate < form.reviewStartDate) {
      setError("Review end date cannot be before review start date.");
      return;
    }

    const reviewPeriod = buildReviewPeriod(form.reviewStartDate, form.reviewEndDate);
    const review = {
      comments: form.comments.trim(),
      employeeId: selectedEmployee.id,
      employeeName: selectedEmployee.name,
      improvement: form.improvement.trim(),
      period: reviewPeriod,
      rating,
      reviewDate: form.reviewDate,
      reviewEndDate: form.reviewEndDate,
      reviewStartDate: form.reviewStartDate,
      reviewer: form.reviewer,
      strengths: form.strengths.trim(),
      type: form.type,
    };

    try {
      setSaving(true);
      const savedReview = await createHrmsReview(review);
      setReviews((current) => [
        savedReview,
        ...current.filter((record) => record.id !== savedReview.id),
      ]);
      setActiveReviewId(savedReview.id);
      setMessage(
        `Review saved to HRMS database for ${savedReview.employeeName}. Total reviews: ${
          reviews.length + 1
        }.`
      );
    } catch (saveError) {
      setError(
        getHrmsReviewErrorMessage(
          saveError,
          "Could not save review to the HRMS database."
        )
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4">
      <Panel>
        <div className="mb-4 grid gap-2">
          <Notice>{message}</Notice>
          <Notice tone={canAddReview ? "success" : "warning"}>
            {canAddReview
              ? ""
              : "Add Review access is restricted to Admin, HR Manager, and Manager roles."}
          </Notice>
          <Notice>
            {previousReviewCycle
              ? `Review period suggested from previous ${previousReviewCycle.type}: ${previousReviewCycle.label}.`
              : ""}
          </Notice>
          <Notice tone="warning">{error || reviewsState.error}</Notice>
          <Notice>
            {(reviewsState.loading && !reviews.length) || salaryAssessmentsState.loading
              ? "Loading reviews from HRMS database..."
              : ""}
          </Notice>
        </div>
        <div className="flex flex-wrap gap-1 border-b border-slate-200">
          {["Review Details", "Salary Reassessment"].map((item, index) => (
            <button
              key={item}
              type="button"
              className={[
                "min-h-10 border-b-2 px-4 text-sm font-bold",
                index === 0
                  ? "border-blue-700 text-blue-700"
                  : "border-transparent text-slate-500",
              ].join(" ")}
            >
              {item}
            </button>
          ))}
        </div>

        <form className="mt-5 grid gap-4 lg:grid-cols-2" onSubmit={saveReview}>
          <div className="grid gap-4">
            <Field label="Employee">
              <Input
                as="select"
                value={form.employeeId}
                onChange={(event) => updateForm("employeeId", event.target.value)}
              >
                <option value="">Select Employee</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {`${employee.name} (${employee.id})`}
                  </option>
                ))}
              </Input>
            </Field>
            <Field label="Review Start Date">
              <DateInput
                className="min-h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                value={form.reviewStartDate}
                onChange={(value) => updateReviewPeriodDate("reviewStartDate", value)}
              />
            </Field>
            <Field label="Review End Date">
              <DateInput
                className="min-h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                value={form.reviewEndDate}
                onChange={(value) => updateReviewPeriodDate("reviewEndDate", value)}
              />
            </Field>
            <Field label="Review Date">
              <DateInput
                className="min-h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                value={form.reviewDate}
                onChange={(value) => updateForm("reviewDate", value)}
              />
            </Field>
            <Field label="Review Period">
              <Input value={form.period} disabled />
            </Field>
            <Field label="Review Type">
              <Input
                as="select"
                value={form.type}
                onChange={(event) => updateForm("type", event.target.value)}
              >
                <option>Manual</option>
                <option>Annual</option>
                <option>Quarterly</option>
                <option>Probation</option>
              </Input>
            </Field>
            <Field label="Reviewer">
              <Input
                value={form.reviewer}
                onChange={(event) => updateForm("reviewer", event.target.value)}
                placeholder="Enter reviewer name"
              />
            </Field>
          </div>

          <div className="grid gap-4">
            <div>
              <p className="text-xs font-bold text-slate-700">Overall Rating</p>
              <div className="mt-2 flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className={[
                      "grid h-8 w-8 place-items-center text-2xl",
                      star <= rating ? "text-amber-400" : "text-slate-300",
                    ].join(" ")}
                    aria-label={`${star} star rating`}
                  >
                    *
                  </button>
                ))}
              </div>
            </div>
            <Field label="Strengths">
              <Input
                as="textarea"
                rows={3}
                value={form.strengths}
                onChange={(event) => updateForm("strengths", event.target.value)}
                placeholder="Enter strengths"
              />
            </Field>
            <Field label="Areas of Improvement">
              <Input
                as="textarea"
                rows={3}
                value={form.improvement}
                onChange={(event) => updateForm("improvement", event.target.value)}
                placeholder="Enter areas of improvement"
              />
            </Field>
            <Field label="Comments">
              <Input
                as="textarea"
                rows={3}
                value={form.comments}
                onChange={(event) => updateForm("comments", event.target.value)}
                placeholder="Enter comments"
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2 lg:col-span-2">
            <Button
              variant="secondary"
              onClick={() => {
                setRating(4);
                setForm((current) => ({
                  ...current,
                  comments: "",
                  improvement: "",
                  period: reviewPeriodSuggestion.period,
                  reviewDate: todayValue(),
                  reviewEndDate: reviewPeriodSuggestion.endDate,
                  reviewStartDate: reviewPeriodSuggestion.startDate,
                  strengths: "",
                }));
                setManualReviewPeriod(false);
                setMessage("");
                setError("");
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !canAddReview}>
              {saving ? "Saving..." : "Save Review"}
            </Button>
          </div>
        </form>
      </Panel>

      <Panel>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-bold">Review Register</h2>
            <p className="text-sm text-slate-500">
              Saved review details from HRMS database.
            </p>
          </div>
          <Link to="/reviews/history">
            <Button variant="secondary">Review History</Button>
          </Link>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[920px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {["Saved Date", "Employee", "Start Date", "End Date", "Period", "Type", "Rating", "Reviewer", "Action"].map(
                  (heading) => (
                    <th key={heading} className="px-3 py-3 font-bold">
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reviewRows.map((record) => (
                <tr
                  key={record.id}
                  className={[
                    "hover:bg-slate-50",
                    activeReviewId === record.id ? "bg-blue-50/50" : "",
                  ].join(" ")}
                >
                  <td className="px-3 py-3">
                    {record.savedAt
                      ? formatDateTime(record.savedAt)
                      : "Not provided"}
                  </td>
                  <td className="px-3 py-3">
                    <strong>{record.employeeName}</strong>
                    <p className="text-xs text-slate-500">{record.employeeId}</p>
                  </td>
                  <td className="px-3 py-3">{formatDate(record.reviewStartDate)}</td>
                  <td className="px-3 py-3">{formatDate(record.reviewEndDate)}</td>
                  <td className="px-3 py-3">{record.period}</td>
                  <td className="px-3 py-3">{record.type}</td>
                  <td className="px-3 py-3">{record.rating || 0} / 5</td>
                  <td className="px-3 py-3">{displayValue(record.reviewer)}</td>
                  <td className="px-3 py-3">
                    <Button
                      className="min-h-8 px-2 text-xs"
                      variant="secondary"
                      onClick={() => setActiveReviewId(record.id)}
                    >
                      View
                    </Button>
                  </td>
                </tr>
              ))}
              {!reviewRows.length && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    No registered review details found. Save a review to create an entry.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {activeReviewRecord && (
        <RegisterDocumentView
          title="PERFORMANCE REVIEW"
          subtitle={`${activeReviewRecord.employeeName} | ${activeReviewRecord.id}`}
          onClose={() => setActiveReviewId("")}
          leftRows={[
            ["Employee", activeReviewRecord.employeeName],
            ["Employee ID", activeReviewRecord.employeeId],
            ["Review Type", activeReviewRecord.type],
            ["Review Period", activeReviewRecord.period],
            ["Review Start", formatDate(activeReviewRecord.reviewStartDate)],
            ["Review End", formatDate(activeReviewRecord.reviewEndDate)],
          ]}
          rightRows={[
            ["Reviewer", displayValue(activeReviewRecord.reviewer)],
            ["Review Date", formatDate(activeReviewRecord.reviewDate)],
            ["Rating", `${activeReviewRecord.rating || 0} / 5`],
            [
              "Saved Date",
              activeReviewRecord.savedAt
                ? formatDateTime(activeReviewRecord.savedAt)
                : "Not provided",
            ],
            ["Register Ref", activeReviewRecord.id],
          ]}
          tableColumns={["Sl No", "Particulars", "Details"]}
          tableRows={[
            {
              id: "strengths",
              values: ["1", "Strengths", displayValue(activeReviewRecord.strengths)],
            },
            {
              id: "improvement",
              values: [
                "2",
                "Areas of Improvement",
                displayValue(activeReviewRecord.improvement),
              ],
            },
            {
              id: "comments",
              values: ["3", "Comments", displayValue(activeReviewRecord.comments)],
            },
          ]}
          bottomLeftTitle="Review Notes"
          bottomLeftValue={displayValue(activeReviewRecord.comments)}
        />
      )}
    </div>
  );
};

const reassessmentMetricLabels = {
  workQuality: "Work Quality",
  communication: "Communication",
  teamwork: "Teamwork",
  leadership: "Leadership",
  punctuality: "Punctuality",
  taskCompletion: "Task Completion",
  innovation: "Innovation",
  clientFeedback: "Client Feedback",
  reporting: "Reporting",
  skillDevelopment: "Skill Development",
};

const defaultReassessmentMetrics = {
  workQuality: 86,
  communication: 82,
  teamwork: 88,
  leadership: 76,
  punctuality: 90,
  taskCompletion: 84,
  innovation: 78,
  clientFeedback: 80,
  reporting: 82,
  skillDevelopment: 81,
};

const approvalStatuses = [
  "Pending",
  "Approved",
  "Rejected",
  "Revision Requested",
];

const SalaryReassessmentPage = () => {
  const [employees, setEmployees] = useHrmsEmployees();
  const [salaryHistory, setSalaryHistory, salaryReassessmentsState] =
    useHrmsSalaryReassessments();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(
    employees[0]?.id || ""
  );
  const [metrics, setMetrics] = useState(defaultReassessmentMetrics);
  const [documents, setDocuments] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [savingAction, setSavingAction] = useState("");
  const [activeRegisterId, setActiveRegisterId] = useState("");
  const [registerEmployeeFilter, setRegisterEmployeeFilter] = useState("all");
  const [registerStatusFilter, setRegisterStatusFilter] = useState("all");
  const [form, setForm] = useState({
    acknowledgement: "Pending",
    attendanceScore: 90,
    behaviorScore: 88,
    bonus: "",
    departmentTransfer: "",
    digitalSignature: "",
    effectiveDate: todayValue(),
    employeeComment: "",
    employeeSelfReview: "",
    hrComments: "",
    hrStatus: "Pending",
    incrementPercent: 10,
    kpiScore: 86,
    managerComments: "",
    managerStatus: "Pending",
    overallRating: 4,
    productivityScore: 84,
    promotionEffectiveDate: todayValue(),
    promotionRecommendation: "No Promotion",
    proposedRole: "",
    reviewDate: todayValue(),
    reviewPeriod: "Jan 2026 - Dec 2026",
    reviewerName: "",
    salaryStatus: "Pending",
    strengths: "",
    directorStatus: "Pending",
    improvement: "",
    notifyEmail: true,
    notifyHr: true,
    notifyPromotion: false,
    reminder: true,
  });
  const selectedEmployee =
    employees.find((employee) => employee.id === selectedEmployeeId) || null;
  const currentSalary = Number(selectedEmployee?.salary || 0);
  const incrementPercent = clampNumber(form.incrementPercent, 0, 100);
  const incrementAmount = Math.round((currentSalary * incrementPercent) / 100);
  const revisedSalary = currentSalary + incrementAmount;
  const bonus = Number(form.bonus || 0);
  const metricRows = Object.entries(metrics).map(([key, value]) => ({
    key,
    label: reassessmentMetricLabels[key],
    value,
  }));
  const metricAverage = averageScore(metricRows.map((metric) => metric.value));
  const reviewScore = averageScore([
    form.kpiScore,
    form.attendanceScore,
    form.behaviorScore,
    form.productivityScore,
    metricAverage,
  ]);
  const grade = scoreGrade(reviewScore);
  const employeeHistory = useMemo(
    () =>
      salaryHistory
        .filter((record) => record.employeeId === selectedEmployeeId)
        .sort((first, second) =>
          String(second.savedAt || "").localeCompare(String(first.savedAt || ""))
        ),
    [salaryHistory, selectedEmployeeId]
  );
  const registerRows = useMemo(() => {
    return [...salaryHistory]
      .sort((first, second) =>
        String(second.savedAt || "").localeCompare(String(first.savedAt || ""))
      )
      .filter((record) =>
        registerEmployeeFilter === "all"
          ? true
          : record.employeeId === registerEmployeeFilter
      )
      .filter((record) =>
        registerStatusFilter === "all"
          ? true
          : record.salaryStatus === registerStatusFilter
      );
  }, [registerEmployeeFilter, registerStatusFilter, salaryHistory]);
  const registerStatuses = useMemo(
    () =>
      Array.from(
        new Set(salaryHistory.map((record) => record.salaryStatus).filter(Boolean))
      ),
    [salaryHistory]
  );
  const activeRegisterRecord =
    registerRows.find((record) => record.id === activeRegisterId) ||
    registerRows[0] ||
    null;
  const lastIncrement = employeeHistory.find(
    (record) => Number(record.incrementAmount || 0) > 0
  );
  const aiIncrement =
    reviewScore >= 90 ? 15 : reviewScore >= 82 ? 12 : reviewScore >= 72 ? 8 : 4;
  const resignationRisk =
    form.attendanceScore < 70 || form.behaviorScore < 65
      ? "Medium"
      : reviewScore >= 85 && incrementPercent < 8
        ? "Medium"
        : "Low";
  const promotionReadiness =
    reviewScore >= 88 && metrics.leadership >= 80
      ? "Ready"
      : reviewScore >= 78
        ? "Developing"
        : "Not Ready";
  const compensationBreakup = getSalaryBreakup(selectedEmployee || {}, revisedSalary);
  const compensationRows = [
    ["Gross Salary", compensationBreakup.grossSalary],
    ["Monthly Salary", compensationBreakup.monthlySalary],
    ["Allowances", compensationBreakup.allowances],
    ["Deduction", compensationBreakup.deduction],
    ["PF", compensationBreakup.pfAmount],
    ["ESI", compensationBreakup.esiAmount],
    ["TDS", compensationBreakup.tdsAmount],
    ["Professional Tax", compensationBreakup.professionalTax],
    ["Net Salary", compensationBreakup.netSalary],
  ];

  useEffect(() => {
    if (!selectedEmployeeId && employees[0]?.id) {
      setSelectedEmployeeId(employees[0].id);
    }
  }, [employees, selectedEmployeeId]);

  const selectReassessmentEmployee = (id) => {
    const employee = employees.find((record) => record.id === id);
    setSelectedEmployeeId(id);
    setActiveRegisterId("");
    setForm((current) => ({
      ...current,
      departmentTransfer: employee?.department || "",
      proposedRole: employee?.designation || "",
    }));
    setMessage("");
    setError("");
  };

  useEffect(() => {
    if (!selectedEmployee) return;

    setForm((current) => ({
      ...current,
      departmentTransfer:
        current.departmentTransfer || selectedEmployee.department || "",
      proposedRole: current.proposedRole || selectedEmployee.designation || "",
    }));
  }, [selectedEmployee?.id]);

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage("");
    setError("");
  };

  const updateMetric = (key, value) => {
    setMetrics((current) => ({ ...current, [key]: clampNumber(value) }));
    setMessage("");
    setError("");
  };

  const buildRecord = (status) => {
    const approved = status === "Approved" || status === "Salary Activated";

    return {
      id: `SAL-${Date.now()}`,
      acknowledgement: form.acknowledgement,
      attendanceScore: Number(form.attendanceScore) || 0,
      behaviorScore: Number(form.behaviorScore) || 0,
      bonus,
      compensationRows,
      esiAmount: compensationBreakup.esiAmount,
      allowances: compensationBreakup.allowances,
      monthlySalary: compensationBreakup.monthlySalary,
      netSalary: compensationBreakup.netSalary,
      pfAmount: compensationBreakup.pfAmount,
      professionalTax: compensationBreakup.professionalTax,
      salaryDeduction: compensationBreakup.deduction,
      tdsAmount: compensationBreakup.tdsAmount,
      totalDeductions: compensationBreakup.totalDeductions,
      currentRole: selectedEmployee?.designation || "",
      currentSalary,
      departmentTransfer: form.departmentTransfer,
      digitalSignature: form.digitalSignature.trim(),
      documents,
      effectiveDate: form.effectiveDate,
      employeeComment: form.employeeComment.trim(),
      employeeId: selectedEmployee?.id || "",
      employeeName: selectedEmployee?.name || "",
      employeeSelfReview: form.employeeSelfReview.trim(),
      grade,
      hrComments: form.hrComments.trim(),
      incrementAmount,
      incrementPercent,
      kpiScore: Number(form.kpiScore) || 0,
      managerComments: form.managerComments.trim(),
      metricAverage,
      metrics,
      overallRating: Number(form.overallRating) || 0,
      productivityScore: Number(form.productivityScore) || 0,
      promotionEffectiveDate: form.promotionEffectiveDate,
      promotionReadiness,
      promotionRecommendation: form.promotionRecommendation,
      proposedRole: form.proposedRole.trim(),
      resignationRisk,
      revisedSalary,
      reviewDate: form.reviewDate,
      reviewPeriod: form.reviewPeriod,
      reviewerName: form.reviewerName.trim(),
      reviewScore,
      salaryStatus: status,
      savedAt: new Date().toISOString(),
      strengths: form.strengths.trim(),
      directorStatus: approved ? "Approved" : form.directorStatus,
      hrStatus: approved ? "Approved" : form.hrStatus,
      improvement: form.improvement.trim(),
      managerStatus: approved ? "Approved" : form.managerStatus,
      notificationSettings: {
        notifyEmail: form.notifyEmail,
        notifyHr: form.notifyHr,
        notifyPromotion: form.notifyPromotion,
        reminder: form.reminder,
      },
    };
  };

  const saveReassessment = async (status = "Pending", activateSalary = false) => {
    if (!selectedEmployee) {
      setError("Add an employee before saving salary reassessment.");
      return;
    }

    const record = buildRecord(status);
    const nextEmployee = {
      ...selectedEmployee,
      department: form.departmentTransfer || selectedEmployee.department,
      designation:
        form.promotionRecommendation === "Promotion Recommended" &&
        form.proposedRole
          ? form.proposedRole
          : selectedEmployee.designation,
      salary: revisedSalary,
    };

    try {
      setSavingAction(status);
      setError("");
      const savedRecord = await createHrmsSalaryReassessment(record);
      setSalaryHistory((current) => [
        savedRecord,
        ...current.filter((item) => item.id !== savedRecord.id),
      ]);

      if (activateSalary) {
        const savedEmployee = await updateHrmsEmployee(
          selectedEmployee.id,
          nextEmployee
        );
        setEmployees((current) =>
          current.map((employee) =>
            employee.id === savedEmployee.id ? savedEmployee : employee
          )
        );
      }

      setMessage(
        activateSalary
          ? `Salary activated for ${savedRecord.employeeName}. Revised salary is ${money(savedRecord.revisedSalary)}.`
          : `Salary reassessment saved to HRMS database for ${savedRecord.employeeName}.`
      );
      setActiveRegisterId(savedRecord.id);
    } catch (saveError) {
      setError(
        getHrmsSalaryReassessmentErrorMessage(
          saveError,
          "Could not save salary reassessment to the HRMS database."
        )
      );
    } finally {
      setSavingAction("");
    }
  };

  const loadRegisterRecord = (record) => {
    if (!record) return;

    setSelectedEmployeeId(record.employeeId);
    setActiveRegisterId(record.id);
    setMetrics({
      ...defaultReassessmentMetrics,
      ...(record.metrics || {}),
    });
    setDocuments(record.documents || []);
    setForm((current) => ({
      ...current,
      acknowledgement: record.acknowledgement || "Pending",
      attendanceScore: record.attendanceScore ?? current.attendanceScore,
      behaviorScore: record.behaviorScore ?? current.behaviorScore,
      bonus: String(record.bonus || ""),
      departmentTransfer: record.departmentTransfer || "",
      digitalSignature: record.digitalSignature || "",
      effectiveDate: record.effectiveDate || todayValue(),
      employeeComment: record.employeeComment || "",
      employeeSelfReview: record.employeeSelfReview || "",
      hrComments: record.hrComments || "",
      hrStatus: record.hrStatus || "Pending",
      incrementPercent: record.incrementPercent ?? current.incrementPercent,
      kpiScore: record.kpiScore ?? current.kpiScore,
      managerComments: record.managerComments || "",
      managerStatus: record.managerStatus || "Pending",
      overallRating: record.overallRating || current.overallRating,
      productivityScore: record.productivityScore ?? current.productivityScore,
      promotionEffectiveDate: record.promotionEffectiveDate || todayValue(),
      promotionRecommendation: record.promotionRecommendation || "No Promotion",
      proposedRole: record.proposedRole || record.currentRole || "",
      reviewDate: record.reviewDate || todayValue(),
      reviewPeriod: record.reviewPeriod || current.reviewPeriod,
      reviewerName: record.reviewerName || "",
      salaryStatus: record.salaryStatus || "Pending",
      strengths: record.strengths || "",
      directorStatus: record.directorStatus || "Pending",
      improvement: record.improvement || "",
      notifyEmail:
        record.notificationSettings?.notifyEmail ?? current.notifyEmail,
      notifyHr: record.notificationSettings?.notifyHr ?? current.notifyHr,
      notifyPromotion:
        record.notificationSettings?.notifyPromotion ?? current.notifyPromotion,
      reminder: record.notificationSettings?.reminder ?? current.reminder,
    }));
    setError("");
    setMessage(`${record.employeeName} reassessment loaded from HRMS database register.`);

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const activateRegisterRecord = async (record) => {
    if (!record) return;

    const employee = employees.find((item) => item.id === record.employeeId);
    const activatedRecord = {
      ...record,
      directorStatus: "Approved",
      hrStatus: "Approved",
      managerStatus: "Approved",
      salaryActivationStatus: "Salary Activated",
      salaryStatus: "Salary Activated",
      status: "Salary Activated",
    };

    try {
      setSavingAction(`activate-${record.id}`);
      setError("");
      const savedRecord = await updateHrmsSalaryReassessment(
        record.id,
        activatedRecord
      );

      if (employee) {
        const savedEmployee = await updateHrmsEmployee(employee.id, {
          ...employee,
          department: record.departmentTransfer || employee.department,
          designation:
            record.promotionRecommendation === "Promotion Recommended" &&
            record.proposedRole
              ? record.proposedRole
              : employee.designation,
          salary: Number(record.revisedSalary || employee.salary || 0),
        });
        setEmployees((current) =>
          current.map((item) =>
            item.id === savedEmployee.id ? savedEmployee : item
          )
        );
      }

      setSalaryHistory((current) =>
        current.map((item) => (item.id === savedRecord.id ? savedRecord : item))
      );
      setActiveRegisterId(savedRecord.id);
      setMessage(
        `${savedRecord.employeeName} salary activated from register. Revised salary is ${money(savedRecord.revisedSalary)}.`
      );
    } catch (activateError) {
      setError(
        getHrmsSalaryReassessmentErrorMessage(
          activateError,
          "Could not activate salary reassessment in the HRMS database."
        )
      );
    } finally {
      setSavingAction("");
    }
  };

  const deleteRegisterRecord = async (record) => {
    if (!record) return;

    const confirmed = window.confirm(
      `Delete salary reassessment ${record.id} for ${record.employeeName}?`
    );

    if (!confirmed) return;

    try {
      setSavingAction(`delete-${record.id}`);
      setError("");
      await deleteHrmsSalaryReassessment(record.id);
      setSalaryHistory((current) =>
        current.filter((item) => item.id !== record.id)
      );
      setActiveRegisterId("");
      setMessage(`${record.employeeName} reassessment deleted from HRMS database.`);
    } catch (deleteError) {
      setError(
        getHrmsSalaryReassessmentErrorMessage(
          deleteError,
          "Could not delete salary reassessment from the HRMS database."
        )
      );
    } finally {
      setSavingAction("");
    }
  };

  const downloadRegisterRecord = (record) => {
    if (!record) return;

    downloadTextFile(
      `${record.employeeId}-${record.id}-salary-reassessment.json`,
      JSON.stringify(record, null, 2),
      "application/json"
    );
  };

  const handleDocumentUpload = (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setDocuments((current) => [
      ...current,
      ...files.map((file) => ({
        addedAt: new Date().toISOString(),
        name: file.name,
        size: file.size,
        type: file.type || "Document",
      })),
    ]);
    event.target.value = "";
  };

  const downloadReport = () => {
    if (!selectedEmployee) {
      setMessage("Select an employee before downloading the report.");
      return;
    }

    downloadTextFile(
      `${selectedEmployee.id}-salary-reassessment.json`,
      JSON.stringify(buildRecord("Report Generated"), null, 2),
      "application/json"
    );
  };

  const printRevisionLetter = () => {
    if (typeof window === "undefined" || !selectedEmployee) {
      setMessage("Select an employee before printing the salary revision letter.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>${escapeHtml(selectedEmployee.name)} Salary Revision</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; color: #0f172a; }
            h1 { font-size: 22px; margin-bottom: 8px; }
            p { line-height: 1.6; }
            table { width: 100%; border-collapse: collapse; margin: 24px 0; }
            td { border: 1px solid #e2e8f0; padding: 10px; }
            .label { color: #64748b; font-weight: 700; width: 36%; }
            .footer { margin-top: 48px; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <h1>Salary Revision Letter</h1>
          <p>Dear ${escapeHtml(selectedEmployee.name)},</p>
          <p>Based on the completed performance review for ${escapeHtml(form.reviewPeriod)}, your revised salary details are listed below.</p>
          <table>
            <tr><td class="label">Employee ID</td><td>${escapeHtml(selectedEmployee.id)}</td></tr>
            <tr><td class="label">Current Salary</td><td>${escapeHtml(money(currentSalary))}</td></tr>
            <tr><td class="label">Increment</td><td>${incrementPercent}% (${escapeHtml(money(incrementAmount))})</td></tr>
            <tr><td class="label">Revised Salary</td><td>${escapeHtml(money(revisedSalary))}</td></tr>
            <tr><td class="label">Effective Date</td><td>${escapeHtml(formatDate(form.effectiveDate))}</td></tr>
            <tr><td class="label">Grade</td><td>${escapeHtml(grade)}</td></tr>
          </table>
          <p>Regards,<br/>HR Department</p>
          <div class="footer">
            <span>HR Signature: __________________</span>
            <span>Employee Signature: __________________</span>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
  };

  const printAppraisalPdf = (record = activeRegisterRecord) => {
    const sourceRecord = record || buildRecord("Report Generated");
    const employee =
      employees.find((item) => item.id === sourceRecord.employeeId) ||
      selectedEmployee;

    if (typeof window === "undefined" || !employee) {
      setMessage("Select an employee before generating the appraisal PDF.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=1000,height=760");
    if (!printWindow) {
      window.print();
      return;
    }

    const metricsRows = Object.entries(sourceRecord.metrics || metrics)
      .map(
        ([key, value]) => `
          <tr>
            <td>${escapeHtml(reassessmentMetricLabels[key] || key)}</td>
            <td>${escapeHtml(String(value ?? 0))}</td>
          </tr>
        `
      )
      .join("");
    const historyRows = salaryHistory
      .filter((item) => item.employeeId === employee.id)
      .slice(0, 8)
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.id)}</td>
            <td>${escapeHtml(item.reviewPeriod || "Not provided")}</td>
            <td>${escapeHtml(formatDate(item.reviewDate || item.effectiveDate))}</td>
            <td>${escapeHtml(money(item.currentSalary))}</td>
            <td>${escapeHtml(money(item.revisedSalary))}</td>
            <td>${escapeHtml(item.salaryStatus || item.status || "Pending")}</td>
          </tr>
        `
      )
      .join("");
    const documentRows = (sourceRecord.documents || [])
      .map(
        (document) => `
          <tr>
            <td>${escapeHtml(document.name || "Document")}</td>
            <td>${escapeHtml(document.type || "Document")}</td>
            <td>${escapeHtml(formatDateTime(document.addedAt))}</td>
          </tr>
        `
      )
      .join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>${escapeHtml(employee.name)} Appraisal PDF</title>
          <style>
            body { color: #0f172a; font-family: Arial, sans-serif; margin: 0; padding: 34px; }
            h1 { font-size: 24px; margin: 0; }
            h2 { border-bottom: 2px solid #2563eb; font-size: 15px; margin: 26px 0 10px; padding-bottom: 6px; }
            table { border-collapse: collapse; margin-top: 10px; width: 100%; }
            th, td { border: 1px solid #dbe3ef; font-size: 12px; padding: 8px; text-align: left; vertical-align: top; }
            th { background: #f8fafc; color: #475569; }
            .muted { color: #64748b; }
            .grid { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; margin-top: 18px; }
            .box { border: 1px solid #dbe3ef; padding: 12px; }
            .label { color: #64748b; font-weight: 700; width: 34%; }
          </style>
        </head>
        <body>
          <h1>Employee Appraisal PDF</h1>
          <p class="muted">Generated on ${escapeHtml(formatDateTime(new Date().toISOString()))}</p>

          <div class="grid">
            <table>
              <tr><td class="label">Employee</td><td>${escapeHtml(employee.name)}</td></tr>
              <tr><td class="label">Employee ID</td><td>${escapeHtml(employee.id)}</td></tr>
              <tr><td class="label">Department</td><td>${escapeHtml(employee.department || "Not provided")}</td></tr>
              <tr><td class="label">Designation</td><td>${escapeHtml(employee.designation || "Not provided")}</td></tr>
              <tr><td class="label">Reviewer</td><td>${escapeHtml(sourceRecord.reviewerName || "Not provided")}</td></tr>
              <tr><td class="label">Review Period</td><td>${escapeHtml(sourceRecord.reviewPeriod || "Not provided")}</td></tr>
              <tr><td class="label">Review Date</td><td>${escapeHtml(formatDate(sourceRecord.reviewDate))}</td></tr>
            </table>
            <table>
              <tr><td class="label">Current Salary</td><td>${escapeHtml(money(sourceRecord.currentSalary))}</td></tr>
              <tr><td class="label">Increment</td><td>${escapeHtml(String(sourceRecord.incrementPercent || 0))}% (${escapeHtml(money(sourceRecord.incrementAmount))})</td></tr>
              <tr><td class="label">Bonus</td><td>${escapeHtml(money(sourceRecord.bonus))}</td></tr>
              <tr><td class="label">Revised Salary</td><td>${escapeHtml(money(sourceRecord.revisedSalary))}</td></tr>
              <tr><td class="label">Net Salary</td><td>${escapeHtml(money(sourceRecord.netSalary))}</td></tr>
              <tr><td class="label">Grade</td><td>${escapeHtml(sourceRecord.grade || "Not provided")}</td></tr>
              <tr><td class="label">Status</td><td>${escapeHtml(sourceRecord.salaryStatus || sourceRecord.status || "Pending")}</td></tr>
            </table>
          </div>

          <h2>Assessment Ratings</h2>
          <table>
            <thead><tr><th>Metric</th><th>Score</th></tr></thead>
            <tbody>
              <tr><td>KPI Score</td><td>${escapeHtml(String(sourceRecord.kpiScore || 0))}</td></tr>
              <tr><td>Attendance Score</td><td>${escapeHtml(String(sourceRecord.attendanceScore || 0))}</td></tr>
              <tr><td>Behavior Score</td><td>${escapeHtml(String(sourceRecord.behaviorScore || 0))}</td></tr>
              <tr><td>Productivity Score</td><td>${escapeHtml(String(sourceRecord.productivityScore || 0))}</td></tr>
              ${metricsRows || `<tr><td colspan="2">No metric details saved</td></tr>`}
            </tbody>
          </table>

          <h2>Comments And Approval</h2>
          <table>
            <tr><td class="label">Strengths</td><td>${escapeHtml(sourceRecord.strengths || "Not provided")}</td></tr>
            <tr><td class="label">Improvement</td><td>${escapeHtml(sourceRecord.improvement || "Not provided")}</td></tr>
            <tr><td class="label">Manager Comments</td><td>${escapeHtml(sourceRecord.managerComments || "Not provided")}</td></tr>
            <tr><td class="label">HR Comments</td><td>${escapeHtml(sourceRecord.hrComments || "Not provided")}</td></tr>
            <tr><td class="label">Employee Comments</td><td>${escapeHtml(sourceRecord.employeeComment || "Not provided")}</td></tr>
            <tr><td class="label">Manager Approval</td><td>${escapeHtml(sourceRecord.managerStatus || "Pending")}</td></tr>
            <tr><td class="label">HR Approval</td><td>${escapeHtml(sourceRecord.hrStatus || "Pending")}</td></tr>
            <tr><td class="label">Director Approval</td><td>${escapeHtml(sourceRecord.directorStatus || "Pending")}</td></tr>
            <tr><td class="label">Employee Acknowledgement</td><td>${escapeHtml(sourceRecord.acknowledgement || "Pending")}</td></tr>
            <tr><td class="label">Digital Signature</td><td>${escapeHtml(sourceRecord.digitalSignature || "Not provided")}</td></tr>
          </table>

          <h2>Review History</h2>
          <table>
            <thead>
              <tr><th>Ref</th><th>Period</th><th>Date</th><th>Previous Salary</th><th>Revised Salary</th><th>Status</th></tr>
            </thead>
            <tbody>${historyRows || `<tr><td colspan="6">No salary assessment history found</td></tr>`}</tbody>
          </table>

          <h2>Appraisal Documents</h2>
          <table>
            <thead><tr><th>Document</th><th>Type</th><th>Added Date</th></tr></thead>
            <tbody>${documentRows || `<tr><td colspan="3">No documents attached</td></tr>`}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
  };

  return (
    <div className="grid gap-4">
      <Panel>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <Field label="Employee">
              <Input
                as="select"
                value={selectedEmployeeId}
                onChange={(event) => {
                  selectReassessmentEmployee(event.target.value);
                }}
              >
                <option value="">Select Employee</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.id} - {employee.name}
                  </option>
                ))}
              </Input>
            </Field>
            <Notice>{message}</Notice>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                printAppraisalPdf(activeRegisterRecord || buildRecord("Report Generated"))
              }
            >
              <AppIcon name="file" className="h-4 w-4" />
              Appraisal PDF
            </Button>
            <Button variant="secondary" onClick={printRevisionLetter}>
              <AppIcon name="receipt" className="h-4 w-4" />
              Revision Letter
            </Button>
            <Button onClick={downloadReport}>
              <AppIcon name="download" className="h-4 w-4" />
              Review Report
            </Button>
          </div>
        </div>
      </Panel>

      {!selectedEmployee && (
        <Panel>
          <Notice tone="warning">Add an employee before salary reassessment.</Notice>
          <Link to="/employees/add">
            <Button className="mt-4">
              <AppIcon name="plus" className="h-4 w-4" />
              Add Employee
            </Button>
          </Link>
        </Panel>
      )}

      {selectedEmployee && (
        <>
          <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)_360px]">
            <Panel>
              <div className="flex gap-4">
                <Avatar
                  initials={selectedEmployee.avatar}
                  size="lg"
                  src={selectedEmployee.photo}
                />
                <div>
                  <h2 className="text-xl font-bold">{selectedEmployee.name}</h2>
                  <p className="text-sm font-semibold text-slate-500">
                    {selectedEmployee.id}
                  </p>
                  <p className="text-sm text-slate-500">
                    {displayValue(selectedEmployee.designation)}
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 text-sm">
                {[
                  ["Department", displayValue(selectedEmployee.department)],
                  ["Joining Date", displayValue(selectedEmployee.joined)],
                  ["Current Salary", money(currentSalary)],
                  [
                    "Last Increment",
                    lastIncrement?.effectiveDate
                      ? formatDate(lastIncrement.effectiveDate)
                      : "Not provided",
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <span className="text-slate-500">{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel>
              <div className="grid gap-4 md:grid-cols-4">
                {[
                  ["Overall", `${reviewScore}%`, `Grade ${grade}`],
                  ["KPI", `${form.kpiScore}%`, "Core score"],
                  ["Attendance", `${form.attendanceScore}%`, "Payroll linked"],
                  ["Productivity", `${form.productivityScore}%`, "Delivery score"],
                ].map(([label, value, helper]) => (
                  <div key={label} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-bold text-slate-500">{label}</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
                    <p className="mt-1 text-xs text-slate-500">{helper}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <RadarChart metrics={metricRows} />
                <div className="grid content-center gap-3">
                  <ScoreBar label="Metric Average" value={metricAverage} tone="emerald" />
                  <ScoreBar label="Behavior Score" value={form.behaviorScore} tone="violet" />
                  <ScoreBar label="Promotion Readiness" value={reviewScore} tone="amber" />
                </div>
              </div>
            </Panel>

            <Panel>
              <h2 className="text-sm font-bold">AI Recommendation</h2>
              <div className="mt-4 grid gap-3 text-sm">
                {[
                  ["Suggested Increment", `${aiIncrement}%`],
                  ["Promotion Eligibility", promotionReadiness],
                  ["Resignation Risk", resignationRisk],
                  ["Performance Trend", reviewScore >= 80 ? "Positive" : "Needs attention"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 rounded-md bg-slate-50 px-3 py-2">
                    <span className="text-slate-500">{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <Button
                className="mt-4 w-full"
                variant="secondary"
                onClick={() => updateForm("incrementPercent", aiIncrement)}
              >
                Apply AI Increment
              </Button>
            </Panel>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <Panel>
              <h2 className="text-sm font-bold">Performance Review</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <Field label="Review Period">
                  <Input
                    value={form.reviewPeriod}
                    onChange={(event) => updateForm("reviewPeriod", event.target.value)}
                  />
                </Field>
                <Field label="Reviewer Name">
                  <Input
                    value={form.reviewerName}
                    onChange={(event) => updateForm("reviewerName", event.target.value)}
                    placeholder="Enter reviewer"
                  />
                </Field>
                <Field label="Review Date">
                  <DateInput
                    className="min-h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                    value={form.reviewDate}
                    onChange={(value) => updateForm("reviewDate", value)}
                  />
                </Field>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  ["KPI Score", "kpiScore"],
                  ["Attendance Score", "attendanceScore"],
                  ["Behavior Score", "behaviorScore"],
                  ["Productivity Score", "productivityScore"],
                ].map(([label, key]) => (
                  <ScoreInput
                    key={key}
                    label={label}
                    value={form[key]}
                    onChange={(value) => updateForm(key, value)}
                  />
                ))}
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <span className="text-xs font-bold text-slate-700">Overall Rating</span>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => updateForm("overallRating", star)}
                    className={[
                      "grid h-9 w-9 place-items-center rounded-md border text-xl font-bold",
                      star <= form.overallRating
                        ? "border-amber-300 bg-amber-50 text-amber-500"
                        : "border-slate-200 text-slate-300",
                    ].join(" ")}
                    aria-label={`${star} star rating`}
                  >
                    *
                  </button>
                ))}
                <StatusBadge status={`Grade ${grade}`} />
              </div>
            </Panel>

            <Panel>
              <h2 className="text-sm font-bold">Salary Reassessment</h2>
              <div className="mt-4 grid gap-4">
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xs font-bold text-slate-500">Current Salary</p>
                  <p className="mt-1 text-3xl font-bold">{money(currentSalary)}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Recommended Increment %">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={form.incrementPercent}
                      onChange={(event) => updateForm("incrementPercent", event.target.value)}
                    />
                  </Field>
                  <Field label="Bonus">
                    <Input
                      type="number"
                      min="0"
                      value={form.bonus}
                      onChange={(event) => updateForm("bonus", event.target.value)}
                      placeholder="Enter bonus"
                    />
                  </Field>
                  <Field label="Effective Date">
                    <DateInput
                      className="min-h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                      value={form.effectiveDate}
                      onChange={(value) => updateForm("effectiveDate", value)}
                    />
                  </Field>
                  <Field label="Promotion Recommendation">
                    <Input
                      as="select"
                      value={form.promotionRecommendation}
                      onChange={(event) => updateForm("promotionRecommendation", event.target.value)}
                    >
                      <option>No Promotion</option>
                      <option>Promotion Recommended</option>
                      <option>Role Enhancement</option>
                    </Input>
                  </Field>
                </div>
                <div className="grid gap-2 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <span>Increment Amount</span>
                    <strong>{money(incrementAmount)}</strong>
                  </div>
                  <div className="flex justify-between gap-4 text-base">
                    <span>Revised Salary</span>
                    <strong>{money(revisedSalary)}</strong>
                  </div>
                  <div className="flex justify-between gap-4 text-slate-600">
                    <span>Total With Bonus</span>
                    <strong>{money(revisedSalary + bonus)}</strong>
                  </div>
                </div>
              </div>
            </Panel>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <Panel>
              <h2 className="text-sm font-bold">KPI / Performance Metrics</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {metricRows.map((metric) => (
                  <ScoreInput
                    key={metric.key}
                    label={metric.label}
                    value={metric.value}
                    onChange={(value) => updateMetric(metric.key, value)}
                  />
                ))}
              </div>
            </Panel>

            <Panel>
              <h2 className="text-sm font-bold">Promotion Management</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Current Role">
                  <Input value={selectedEmployee.designation || ""} disabled />
                </Field>
                <Field label="Proposed Role">
                  <Input
                    value={form.proposedRole}
                    onChange={(event) => updateForm("proposedRole", event.target.value)}
                    placeholder="Enter proposed role"
                  />
                </Field>
                <Field label="Promotion Effective Date">
                  <DateInput
                    className="min-h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                    value={form.promotionEffectiveDate}
                    onChange={(value) =>
                      updateForm("promotionEffectiveDate", value)
                    }
                  />
                </Field>
                <Field label="Department Transfer">
                  <Input
                    value={form.departmentTransfer}
                    onChange={(event) => updateForm("departmentTransfer", event.target.value)}
                    placeholder="Enter department"
                  />
                </Field>
              </div>

              <h2 className="mt-6 text-sm font-bold">Review Comments</h2>
              <div className="mt-4 grid gap-4">
                {[
                  ["Employee Strengths", "strengths"],
                  ["Areas of Improvement", "improvement"],
                  ["HR Comments", "hrComments"],
                  ["Manager Comments", "managerComments"],
                  ["Employee Self Review", "employeeSelfReview"],
                ].map(([label, key]) => (
                  <Field key={key} label={label}>
                    <Input
                      as="textarea"
                      rows={2}
                      value={form[key]}
                      onChange={(event) => updateForm(key, event.target.value)}
                      placeholder={label}
                    />
                  </Field>
                ))}
              </div>
            </Panel>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
            <Panel>
              <h2 className="text-sm font-bold">Approval Workflow</h2>
              <div className="mt-5 grid gap-3 md:grid-cols-4">
                {[
                  ["Manager Review", "managerStatus"],
                  ["HR Approval", "hrStatus"],
                  ["Director Approval", "directorStatus"],
                  ["Salary Activated", "salaryStatus"],
                ].map(([label, key], index) => (
                  <div key={key} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-blue-700 text-xs font-bold text-white">
                        {index + 1}
                      </span>
                      <strong className="text-sm">{label}</strong>
                    </div>
                    <Input
                      as="select"
                      value={form[key]}
                      onChange={(event) => updateForm(key, event.target.value)}
                    >
                      {approvalStatuses.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </Input>
                  </div>
                ))}
              </div>

              <h2 className="mt-6 text-sm font-bold">Review History Timeline</h2>
              <div className="mt-4 grid gap-3">
                {employeeHistory.length ? (
                  employeeHistory.slice(0, 5).map((record) => (
                    <div key={record.id} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[120px_1fr_auto]">
                      <strong>
                        {formatDate(record.effectiveDate || record.reviewDate)}
                      </strong>
                      <span className="text-sm text-slate-600">
                        {money(record.currentSalary)} to {money(record.revisedSalary)} | Grade {record.grade}
                      </span>
                      <StatusBadge status={record.salaryStatus} />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    No salary reassessment history saved for this employee yet.
                  </p>
                )}
              </div>
            </Panel>

            <Panel>
              <h2 className="text-sm font-bold">Analytics & Charts</h2>
              <SalaryGrowthChart
                records={[...employeeHistory].reverse()}
                currentSalary={currentSalary}
              />
              <div className="mt-4 grid gap-3">
                <ScoreBar label="Department Comparison" value={reviewScore - 4} tone="blue" />
                <ScoreBar label="Top Performer Index" value={reviewScore + 3} tone="emerald" />
                <ScoreBar label="Compensation Benchmark" value={incrementPercent * 7} tone="amber" />
              </div>
            </Panel>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <Panel>
              <h2 className="text-sm font-bold">Compensation Breakdown</h2>
              <div className="mt-4 grid gap-3 text-sm">
                {compensationRows.map(([label, value]) => (
                  <div
                    key={label}
                    className={[
                      "flex justify-between gap-4 border-b border-slate-100 pb-2",
                      label === "Net Salary" ? "font-bold text-blue-800" : "",
                    ].join(" ")}
                  >
                    <span className={label === "Net Salary" ? "" : "text-slate-600"}>{label}</span>
                    <strong>{money(value)}</strong>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel>
              <h2 className="text-sm font-bold">Documents & Notifications</h2>
              <div className="mt-4 grid gap-4">
                <Input type="file" multiple onChange={handleDocumentUpload} />
                <div className="grid gap-2 text-sm">
                  {documents.length ? (
                    documents.map((document) => (
                      <div key={`${document.name}-${document.addedAt}`} className="flex justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
                        <span>{document.name}</span>
                        <span className="text-slate-500">{Math.ceil(document.size / 1024)} KB</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-slate-500">No documents attached.</span>
                  )}
                </div>
                {[
                  ["Increment approval email", "notifyEmail"],
                  ["Promotion notice", "notifyPromotion"],
                  ["HR alerts", "notifyHr"],
                  ["Reminder for pending reviews", "reminder"],
                ].map(([label, key]) => (
                  <label key={key} className="flex items-center gap-3 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={form[key]}
                      onChange={(event) => updateForm(key, event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-700"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </Panel>

            <Panel>
              <h2 className="text-sm font-bold">Employee Acknowledgement</h2>
              <div className="mt-4 grid gap-4">
                <Field label="Acknowledgement">
                  <Input
                    as="select"
                    value={form.acknowledgement}
                    onChange={(event) => updateForm("acknowledgement", event.target.value)}
                  >
                    <option>Pending</option>
                    <option>Accepted</option>
                    <option>Accepted With Comments</option>
                    <option>Rejected</option>
                  </Input>
                </Field>
                <Field label="Employee Comments">
                  <Input
                    as="textarea"
                    rows={3}
                    value={form.employeeComment}
                    onChange={(event) => updateForm("employeeComment", event.target.value)}
                    placeholder="Employee acknowledgement comments"
                  />
                </Field>
                <Field label="Digital Signature">
                  <Input
                    value={form.digitalSignature}
                    onChange={(event) => updateForm("digitalSignature", event.target.value)}
                    placeholder="Type employee name"
                  />
                </Field>
              </div>
            </Panel>
          </section>

          <Panel>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => saveReassessment("Draft", false)}
                disabled={Boolean(savingAction)}
              >
                {savingAction === "Draft" ? "Saving..." : "Save Draft"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => saveReassessment("Approved", false)}
                disabled={Boolean(savingAction)}
              >
                {savingAction === "Approved" ? "Saving..." : "Save Approved Review"}
              </Button>
              <Button
                onClick={() => saveReassessment("Salary Activated", true)}
                disabled={Boolean(savingAction)}
              >
                {savingAction === "Salary Activated"
                  ? "Activating..."
                  : "Activate Salary"}
              </Button>
            </div>
          </Panel>
        </>
      )}

      <Panel>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-base font-bold">Salary Reassessment Register</h2>
            <p className="mt-1 text-sm text-slate-500">
              Saved drafts, approved reviews, and activated salary revisions from HRMS database.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:w-[520px]">
            <Field label="Employee Filter">
              <Input
                as="select"
                value={registerEmployeeFilter}
                onChange={(event) => {
                  setRegisterEmployeeFilter(event.target.value);
                  setActiveRegisterId("");
                }}
              >
                <option value="all">All Employees</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.id} - {employee.name}
                  </option>
                ))}
              </Input>
            </Field>
            <Field label="Status Filter">
              <Input
                as="select"
                value={registerStatusFilter}
                onChange={(event) => {
                  setRegisterStatusFilter(event.target.value);
                  setActiveRegisterId("");
                }}
              >
                <option value="all">All Statuses</option>
                {registerStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Input>
            </Field>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[1180px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {[
                  "Saved Date",
                  "Employee",
                  "Review Period",
                  "Score",
                  "Current Salary",
                  "Increment",
                  "Revised Salary",
                  "Status",
                  "Action",
                ].map((heading) => (
                  <th key={heading} className="px-3 py-3 font-bold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {registerRows.map((record) => (
                <tr
                  key={record.id}
                  className={[
                    "hover:bg-slate-50",
                    activeRegisterRecord?.id === record.id ? "bg-blue-50/50" : "",
                  ].join(" ")}
                >
                  <td className="px-3 py-3">
                    {record.savedAt
                      ? formatDateTime(record.savedAt)
                      : "Not provided"}
                  </td>
                  <td className="px-3 py-3">
                    <strong>{record.employeeName}</strong>
                    <p className="text-xs text-slate-500">{record.employeeId}</p>
                  </td>
                  <td className="px-3 py-3">{record.reviewPeriod}</td>
                  <td className="px-3 py-3">
                    <strong>{record.reviewScore}%</strong>
                    <p className="text-xs text-slate-500">Grade {record.grade}</p>
                  </td>
                  <td className="px-3 py-3">{money(record.currentSalary)}</td>
                  <td className="px-3 py-3">
                    {record.incrementPercent}% / {money(record.incrementAmount)}
                  </td>
                  <td className="px-3 py-3 font-bold">
                    {money(record.revisedSalary)}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={record.salaryStatus} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        className="min-h-8 px-2 text-xs"
                        variant="secondary"
                        onClick={() => loadRegisterRecord(record)}
                      >
                        View
                      </Button>
                      <Button
                        className="min-h-8 px-2 text-xs"
                        onClick={() => activateRegisterRecord(record)}
                        disabled={
                          record.salaryStatus === "Salary Activated" ||
                          Boolean(savingAction)
                        }
                      >
                        {savingAction === `activate-${record.id}`
                          ? "Activating..."
                          : "Activate"}
                      </Button>
                      <Button
                        className="min-h-8 px-2 text-xs"
                        variant="secondary"
                        onClick={() => downloadRegisterRecord(record)}
                      >
                        Download
                      </Button>
                      <Button
                        className="min-h-8 px-2 text-xs"
                        variant="danger"
                        onClick={() => deleteRegisterRecord(record)}
                        disabled={Boolean(savingAction)}
                      >
                        {savingAction === `delete-${record.id}` ? "Deleting..." : "Delete"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!registerRows.length && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    No saved salary reassessment records found. Use Save Draft,
                    Save Approved Review, or Activate Salary to create register entries.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {activeRegisterRecord && (
        <RegisterDocumentView
          title="SALARY REASSESSMENT"
          subtitle={`${activeRegisterRecord.employeeName} | ${activeRegisterRecord.id}`}
          onClose={() => setActiveRegisterId("")}
          leftRows={[
            ["Employee", activeRegisterRecord.employeeName],
            ["Employee ID", activeRegisterRecord.employeeId],
            ["Current Role", activeRegisterRecord.currentRole],
            ["Proposed Role", activeRegisterRecord.proposedRole],
            ["Review Period", activeRegisterRecord.reviewPeriod],
          ]}
          rightRows={[
            ["Status", activeRegisterRecord.salaryStatus],
            ["Review Score", `${activeRegisterRecord.reviewScore}%`],
            ["Grade", activeRegisterRecord.grade],
            ["Rating", `${activeRegisterRecord.overallRating || 0} / 5`],
            ["Effective Date", formatDate(activeRegisterRecord.effectiveDate)],
          ]}
          tableColumns={["Sl No", "Particulars", "Details"]}
          tableRows={[
            {
              id: "currentSalary",
              values: ["1", "Current Salary", money(activeRegisterRecord.currentSalary)],
            },
            {
              id: "increment",
              values: [
                "2",
                "Increment",
                `${activeRegisterRecord.incrementPercent}% / ${money(
                  activeRegisterRecord.incrementAmount
                )}`,
              ],
            },
            {
              id: "revisedSalary",
              values: ["3", "Revised Salary", money(activeRegisterRecord.revisedSalary)],
            },
            {
              id: "approval",
              values: [
                "4",
                "Approval",
                [
                  `Manager: ${activeRegisterRecord.managerStatus || "Pending"}`,
                  `HR: ${activeRegisterRecord.hrStatus || "Pending"}`,
                  `Director: ${activeRegisterRecord.directorStatus || "Pending"}`,
                  `Employee: ${activeRegisterRecord.acknowledgement || "Pending"}`,
                ].join(" | "),
              ],
            },
            {
              id: "attachments",
              values: [
                "5",
                "Attachments",
                activeRegisterRecord.documents?.length
                  ? activeRegisterRecord.documents
                      .map((document) => document.name)
                      .join(", ")
                  : "No attachments saved",
              ],
            },
          ]}
          bottomLeftTitle="Comments"
          bottomLeftValue={[
            activeRegisterRecord.strengths &&
              `Strengths: ${activeRegisterRecord.strengths}`,
            activeRegisterRecord.improvement &&
              `Improvement: ${activeRegisterRecord.improvement}`,
            activeRegisterRecord.hrComments && `HR: ${activeRegisterRecord.hrComments}`,
          ]
            .filter(Boolean)
            .join("\n") || "Not provided"}
        />
      )}
    </div>
  );
};

const AttendancePage = () => {
  const [employees] = useHrmsEmployees();
  const [records, setRecords, attendanceState] = useHrmsAttendance();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(
    employees[0]?.id || ""
  );
  const [month, setMonth] = useState(getCurrentAttendanceMonth());
  const [isManualMonthSelection, setIsManualMonthSelection] = useState(false);
  const [statuses, setStatuses] = useState(DEFAULT_ATTENDANCE_STATUSES);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeAttendanceId, setActiveAttendanceId] = useState("");
  const colorMap = {
    P: "bg-emerald-100 text-emerald-700",
    A: "bg-rose-100 text-rose-700",
    L: "bg-amber-100 text-amber-700",
    H: "bg-blue-100 text-blue-700",
  };
  const currentAttendanceMonth = getCurrentAttendanceMonth();
  const selectedEmployee =
    employees.find((employee) => employee.id === selectedEmployeeId) || null;
  const latestAttendanceRecord = useMemo(() => {
    return [...records]
      .filter((record) => normalizeAttendanceMonth(record.month))
      .sort((first, second) => {
        const monthDiff =
          getAttendanceMonthIndex(second.month) -
          getAttendanceMonthIndex(first.month);
        if (monthDiff) return monthDiff;
        return String(second.savedAt || "").localeCompare(
          String(first.savedAt || "")
        );
      })[0] || null;
  }, [records]);
  const latestAttendanceMonth = normalizeAttendanceMonth(
    latestAttendanceRecord?.month
  );
  const selectedMonth = normalizeAttendanceMonth(month);
  const attendanceDays = useMemo(
    () => getAttendanceDays(selectedMonth || month),
    [month, selectedMonth]
  );
  const normalizedStatuses = useMemo(
    () => normalizeAttendanceStatusesForMonth(statuses, selectedMonth || month),
    [month, selectedMonth, statuses]
  );
  const isCurrentMonthSelected =
    selectedMonth &&
    areAttendanceMonthsEqual(selectedMonth, currentAttendanceMonth);
  const isLatestMonthSelected =
    latestAttendanceMonth &&
    areAttendanceMonthsEqual(selectedMonth, latestAttendanceMonth);
  const attendanceRows = useMemo(
    () =>
      [...records].sort((first, second) => {
        const monthDiff =
          getAttendanceMonthIndex(second.month) -
          getAttendanceMonthIndex(first.month);
        if (monthDiff) return monthDiff;
        return String(second.savedAt || "").localeCompare(
          String(first.savedAt || "")
        );
      }),
    [records]
  );
  const activeAttendanceRecord =
    attendanceRows.find((record) => record.id === activeAttendanceId) || null;
  const activeAttendanceDays = useMemo(
    () =>
      activeAttendanceRecord
        ? getAttendanceDays(activeAttendanceRecord.month)
        : [],
    [activeAttendanceRecord]
  );

  useEffect(() => {
    if (!selectedEmployeeId && employees[0]?.id) {
      setSelectedEmployeeId(employees[0].id);
    }
  }, [employees, selectedEmployeeId]);

  useEffect(() => {
    if (isManualMonthSelection) return;
    const nextMonth = currentAttendanceMonth;
    if (nextMonth && !areAttendanceMonthsEqual(month, nextMonth)) {
      setMonth(nextMonth);
    }
  }, [currentAttendanceMonth, isManualMonthSelection, month]);

  const findAttendanceRecord = useCallback(
    (employeeId, attendanceMonth) =>
      [...records]
        .filter(
          (record) =>
            record.employeeId === employeeId &&
            areAttendanceMonthsEqual(record.month, attendanceMonth)
        )
        .sort((first, second) =>
          String(second.savedAt || "").localeCompare(String(first.savedAt || ""))
        )[0] || null,
    [records]
  );

  const loadAttendance = useCallback(
    ({ silent = false } = {}) => {
      if (!selectedEmployee) {
        if (!silent) {
          setError("Add an employee before viewing attendance.");
        }
        return;
      }

      const saved = findAttendanceRecord(selectedEmployeeId, month);
      setStatuses(
        normalizeAttendanceStatusesForMonth(
          saved?.statuses || DEFAULT_ATTENDANCE_STATUSES,
          month
        )
      );
      setActiveAttendanceId(saved?.id || "");
      if (!silent) {
        setMessage(
          saved
            ? `Loaded ${normalizeAttendanceMonth(month)} attendance from HRMS database for ${selectedEmployee.name}.`
            : `No saved attendance found for ${selectedEmployee.name} in ${normalizeAttendanceMonth(
                month
              )}. Showing default grid.`
        );
      }
      setError("");
    },
    [findAttendanceRecord, month, selectedEmployee, selectedEmployeeId]
  );

  useEffect(() => {
    if (!selectedEmployeeId || !month) return;
    loadAttendance({ silent: true });
  }, [loadAttendance, month, selectedEmployeeId]);

  useEffect(() => {
    if (!month) return;
    setStatuses((current) =>
      normalizeAttendanceStatusesForMonth(current, selectedMonth || month)
    );
  }, [month, selectedMonth]);

  useEffect(() => {
    if (!latestAttendanceRecord?.employeeId || selectedEmployeeId) return;
    setSelectedEmployeeId(latestAttendanceRecord.employeeId);
  }, [latestAttendanceRecord?.employeeId, selectedEmployeeId]);

  const loadRegisterRecord = (record) => {
    setSelectedEmployeeId(record.employeeId);
    setMonth(normalizeAttendanceMonth(record.month));
    setIsManualMonthSelection(true);
    setStatuses(
      normalizeAttendanceStatusesForMonth(
        record.statuses || DEFAULT_ATTENDANCE_STATUSES,
        record.month
      )
    );
    setActiveAttendanceId(record.id);
    setError("");
    setMessage(
      `Loaded ${normalizeAttendanceMonth(record.month)} attendance from HRMS database for ${record.employeeName}.`
    );
  };
  const saveAttendance = async () => {
    if (!selectedEmployee) {
      setError("Add an employee before saving attendance.");
      return;
    }

    const nextStatuses = normalizeAttendanceStatusesForMonth(
      statuses,
      selectedMonth || month
    );
    const counts = nextStatuses.reduce(
      (summary, status) => ({
        ...summary,
        [status]: (summary[status] || 0) + 1,
      }),
      {}
    );
    const record = {
      employeeId: selectedEmployeeId,
      employeeName: selectedEmployee.name,
      month: selectedMonth || month,
      statuses: nextStatuses,
      counts,
    };

    try {
      setSaving(true);
      setError("");
      const savedRecord = await saveHrmsAttendance(record);
      setRecords((current) => [
        savedRecord,
        ...current.filter(
          (item) =>
            !(
              item.employeeId === savedRecord.employeeId &&
              areAttendanceMonthsEqual(item.month, savedRecord.month)
            )
        ),
      ]);
      setActiveAttendanceId(savedRecord.id);
      setMessage(`Attendance saved to HRMS database for ${savedRecord.employeeName}.`);
    } catch (saveError) {
      setError(
        getHrmsAttendanceErrorMessage(
          saveError,
          "Could not save attendance to the HRMS database."
        )
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4">
      <Panel>
        <div className="mb-4 grid gap-2">
          <Notice>{message}</Notice>
          <Notice>
            {selectedMonth
              ? isCurrentMonthSelected
                ? `Current attendance month selected: ${selectedMonth}.`
                : latestAttendanceMonth
                  ? `Manual month selected: ${selectedMonth}. Latest saved attendance month is ${latestAttendanceMonth}.`
                  : `Manual month selected: ${selectedMonth}.`
              : "Select a month to view or save attendance."}
          </Notice>
          <Notice tone="warning">{error || attendanceState.error}</Notice>
          <Notice>
            {attendanceState.loading && !records.length
              ? "Loading attendance from HRMS database..."
              : ""}
          </Notice>
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Field label="Employee">
            <Input
              as="select"
              value={selectedEmployeeId}
              onChange={(event) => {
                setSelectedEmployeeId(event.target.value);
                setActiveAttendanceId("");
                setMessage("");
                setError("");
              }}
            >
              <option value="">Select Employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {`${employee.name} (${employee.id})`}
                </option>
              ))}
            </Input>
          </Field>
          <Field label="Month">
            <Input
              type="month"
              value={toAttendanceMonthInputValue(month)}
              onChange={(event) => {
                setMonth(normalizeAttendanceMonth(event.target.value));
                setIsManualMonthSelection(true);
                setActiveAttendanceId("");
                setMessage("");
                setError("");
              }}
            />
          </Field>
          <Button className="self-end" onClick={loadAttendance}>
            View
          </Button>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold">
            Attendance Overview - {selectedMonth || "Select Month"}
          </h2>
          {isCurrentMonthSelected && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
              Current
            </span>
          )}
          {!isCurrentMonthSelected && isLatestMonthSelected && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
              Latest Saved
            </span>
          )}
        </div>

        <div className="mt-6 overflow-x-auto">
          <div className="min-w-[1100px]">
            <div
              className="grid text-center text-xs"
              style={{
                gridTemplateColumns: `72px repeat(${
                  attendanceDays.length || normalizedStatuses.length
                }, minmax(32px, 1fr))`,
              }}
            >
              <div className="border border-slate-200 bg-slate-50 py-2 font-bold">Date</div>
              {attendanceDays.map((day) => (
                <div
                  key={day.iso}
                  className={[
                    "border-y border-r border-slate-200 py-2 font-bold",
                    day.isWeekend ? "bg-blue-50 text-blue-700" : "bg-slate-50",
                  ].join(" ")}
                >
                  {day.day}
                </div>
              ))}
              <div className="border-x border-b border-slate-200 bg-slate-50 py-2 font-bold">Day</div>
              {attendanceDays.map((day) => (
                <div
                  key={`${day.iso}-weekday`}
                  className={[
                    "border-b border-r border-slate-200 py-2 font-bold",
                    day.isWeekend ? "bg-blue-50 text-blue-700" : "bg-white",
                  ].join(" ")}
                >
                  {day.weekday}
                </div>
              ))}
              <div className="border-x border-b border-slate-200 py-2 font-bold">Status</div>
              {normalizedStatuses.map((status, index) => (
                <button
                  key={`${status}-${index}`}
                  type="button"
                  onClick={() =>
                    setStatuses((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? cycleAttendanceStatus(item) : item
                      )
                    )
                  }
                  className={`border-b border-r border-slate-200 py-2 font-bold ${colorMap[status]}`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-4 text-xs font-semibold text-slate-600">
          {[
            ["P", "Present", colorMap.P],
            ["A", "Absent", colorMap.A],
            ["L", "Leave", colorMap.L],
            ["H", "Holiday", colorMap.H],
          ].map(([code, label, classes]) => (
            <span key={code} className="inline-flex items-center gap-2">
              <span className={`grid h-5 w-5 place-items-center rounded ${classes}`}>{code}</span>
              {label}
            </span>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              loadAttendance({ silent: true });
              setMessage("");
              setError("");
            }}
          >
            Cancel
          </Button>
          <Button onClick={saveAttendance} disabled={saving}>
            {saving ? "Saving..." : "Save Attendance"}
          </Button>
        </div>
      </Panel>

      <Panel>
        <div>
          <h2 className="text-base font-bold">Attendance Register</h2>
          <p className="mt-1 text-sm text-slate-500">
            Saved monthly attendance details from HRMS database.
          </p>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {["Saved Date", "Employee", "Month", "Present", "Absent", "Leave", "Holiday", "Action"].map(
                  (heading) => (
                    <th key={heading} className="px-3 py-3 font-bold">
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attendanceRows.map((record) => (
                <tr
                  key={record.id}
                  className={[
                    "hover:bg-slate-50",
                    activeAttendanceId === record.id ? "bg-blue-50/50" : "",
                  ].join(" ")}
                >
                  <td className="px-3 py-3">
                    {record.savedAt
                      ? formatDateTime(record.savedAt)
                      : "Not provided"}
                  </td>
                  <td className="px-3 py-3">
                    <strong>{record.employeeName}</strong>
                    <p className="text-xs text-slate-500">{record.employeeId}</p>
                  </td>
                  <td className="px-3 py-3">
                    {normalizeAttendanceMonth(record.month)}
                    {areAttendanceMonthsEqual(record.month, latestAttendanceMonth) && (
                      <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                        Latest
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">{record.counts?.P || 0}</td>
                  <td className="px-3 py-3">{record.counts?.A || 0}</td>
                  <td className="px-3 py-3">{record.counts?.L || 0}</td>
                  <td className="px-3 py-3">{record.counts?.H || 0}</td>
                  <td className="px-3 py-3">
                    <Button
                      className="min-h-8 px-2 text-xs"
                      variant="secondary"
                      onClick={() => loadRegisterRecord(record)}
                    >
                      View
                    </Button>
                  </td>
                </tr>
              ))}
              {!attendanceRows.length && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    No registered attendance details found. Save attendance to create an entry.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {activeAttendanceRecord && (
        <RegisterDocumentView
          title="MONTHLY ATTENDANCE"
          subtitle={`${activeAttendanceRecord.employeeName} | ${normalizeAttendanceMonth(activeAttendanceRecord.month)}`}
          onClose={() => setActiveAttendanceId("")}
          leftRows={[
            ["Employee", activeAttendanceRecord.employeeName],
            ["Employee ID", activeAttendanceRecord.employeeId],
            ["Month", normalizeAttendanceMonth(activeAttendanceRecord.month)],
            [
              "Saved Date",
              activeAttendanceRecord.savedAt
                ? formatDateTime(activeAttendanceRecord.savedAt)
                : "Not provided",
            ],
          ]}
          rightRows={[
            ["Present", activeAttendanceRecord.counts?.P || 0],
            ["Absent", activeAttendanceRecord.counts?.A || 0],
            ["Leave", activeAttendanceRecord.counts?.L || 0],
            ["Holiday", activeAttendanceRecord.counts?.H || 0],
          ]}
          tableColumns={["Date", "Status", "Description"]}
          tableRows={normalizeAttendanceStatusesForMonth(
            activeAttendanceRecord.statuses || [],
            activeAttendanceRecord.month
          ).map((status, index) => {
            const day = activeAttendanceDays[index];
            return {
              id: `${activeAttendanceRecord.id}-${index}`,
              values: [
                day ? `${day.day} ${day.weekday}` : String(index + 1),
                status,
                {
                  P: "Present",
                  A: "Absent",
                  L: "Leave",
                  H: "Holiday",
                }[status] || "Present",
              ],
            };
          })}
          bottomLeftTitle="Attendance Summary"
          bottomLeftValue={`Present: ${activeAttendanceRecord.counts?.P || 0}\nAbsent: ${
            activeAttendanceRecord.counts?.A || 0
          }\nLeave: ${activeAttendanceRecord.counts?.L || 0}\nHoliday: ${
            activeAttendanceRecord.counts?.H || 0
          }`}
        />
      )}
    </div>
  );
};

const PayrollPage = () => {
  const [employees] = useHrmsEmployees();
  const [payrollBatches, setPayrollBatches, payrollState] = useHrmsSalaries();
  const [generated, setGenerated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [month, setMonth] = useState(getCurrentAttendanceMonth());
  const [department, setDepartment] = useState("All");
  const [message, setMessage] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [payrollEdits, setPayrollEdits] = useState({});
  const visibleEmployees =
    department === "All"
      ? employees
      : employees.filter((employee) => employee.department === department);
  const rows = visibleEmployees.map((employee, index) => {
    const edit = payrollEdits[employee.id] || {};
    const salary = toSalaryNumber(edit.salary ?? employee.salary);
    const employeeBreakup = getSalaryBreakup(employee, salary);
    const rowAllowances = toSalaryNumber(
      edit.allowances,
      employeeBreakup.allowances
    );
    const rowDeduction = toSalaryNumber(
      edit.deduction,
      employeeBreakup.deduction
    );
    const rowPfAmount = toSalaryNumber(
      edit.pfAmount,
      employeeBreakup.pfAmount
    );
    const rowEsiAmount = toSalaryNumber(
      edit.esiAmount,
      employeeBreakup.esiAmount
    );
    const rowProfessionalTax = toSalaryNumber(
      edit.professionalTax,
      employeeBreakup.professionalTax
    );
    const rowTdsAmount = toSalaryNumber(
      edit.tdsAmount,
      employeeBreakup.tdsAmount
    );
    const totalDeductions =
      rowDeduction + rowPfAmount + rowEsiAmount + rowProfessionalTax + rowTdsAmount;
    const totalEarnings = salary + rowAllowances;

    return {
      ...employee,
      salary,
      basicSalary: salary,
      grossSalary: salary,
      monthlySalary: calculateMonthlySalary(salary),
      allowance: rowAllowances,
      allowances: rowAllowances,
      deduction: rowDeduction,
      deductions: rowDeduction,
      esiAmount: rowEsiAmount,
      net: totalEarnings - totalDeductions,
      netSalary: totalEarnings - totalDeductions,
      pfAmount: rowPfAmount,
      providentFund: rowPfAmount,
      professionalTax: rowProfessionalTax,
      pt: rowProfessionalTax,
      tdsAmount: rowTdsAmount,
      tds: rowTdsAmount,
      totalEarnings,
      totalDeductions,
      status: edit.status || (generated || index < 3 ? "Processed" : "Pending"),
    };
  });
  const selectedPayrollRow =
    rows.find((row) => row.id === selectedEmployeeId) || rows[0] || null;
  const selectedPayrollBatch =
    payrollBatches.find((batch) => batch.id === selectedBatchId) || null;
  const payrollNotice =
    payrollState.error ||
    message ||
    (payrollState.loading ? "Loading payroll from HRMS database..." : "");
  const payrollNoticeTone =
    payrollState.error || /^(Add|Could not|No salary)/.test(message)
      ? "warning"
      : "success";

  useEffect(() => {
    if (rows[0]?.id && !rows.some((row) => row.id === selectedEmployeeId)) {
      setSelectedEmployeeId(rows[0].id);
    }
  }, [rows, selectedEmployeeId]);

  const updatePayrollEdit = (field, value) => {
    if (!selectedPayrollRow) return;

    setPayrollEdits((current) => {
      const currentEdit = current[selectedPayrollRow.id] || {};
      const nextEdit = {
        salary: selectedPayrollRow.salary,
        allowances: selectedPayrollRow.allowances,
        deduction: selectedPayrollRow.deduction,
        esiAmount: selectedPayrollRow.esiAmount,
        pfAmount: selectedPayrollRow.pfAmount,
        professionalTax: selectedPayrollRow.professionalTax,
        status: selectedPayrollRow.status,
        tdsAmount: selectedPayrollRow.tdsAmount,
        ...currentEdit,
        [field]: value,
      };

      return {
        ...current,
        [selectedPayrollRow.id]: nextEdit,
      };
    });
    setGenerated(false);
    setMessage("");
  };
  const savePayroll = async () => {
    if (!rows.length) {
      setMessage("Add employees before saving payroll.");
      return;
    }

    const processedRows = rows.map((row) => ({
      ...row,
      status: payrollEdits[row.id]?.status || "Processed",
    }));

    setSaving(true);
    try {
      const batch = await saveHrmsSalaryBatch({
        department,
        month,
        rows: processedRows,
      });
      if (!batch) {
        throw new Error("No salary rows were returned from the HRMS database.");
      }

      setGenerated(true);
      setPayrollBatches((current) => [
        batch,
        ...current.filter((item) => item.id !== batch.id),
      ]);
      setSelectedBatchId(batch.id);
      setMessage(
        `Payroll saved to HRMS database for ${processedRows.length} employee${
          processedRows.length === 1 ? "" : "s"
        }.`
      );
    } catch (error) {
      setMessage(
        getHrmsSalaryErrorMessage(
          error,
          "Could not save payroll to the HRMS database."
        )
      );
    } finally {
      setSaving(false);
    }
  };
  const loadPayrollBatch = (batch) => {
    if (!batch) return;

    setMonth(
      normalizeAttendanceMonth(batch.month) || getCurrentAttendanceMonth()
    );
    setDepartment(batch.department || "All");
    setGenerated(true);
    setSelectedBatchId(batch.id);
    setSelectedEmployeeId(batch.rows?.[0]?.id || "");
    setPayrollEdits(
      (batch.rows || []).reduce((edits, row) => {
        edits[row.id] = {
          allowances: Number(row.allowances || 0),
          deduction: Number(row.deduction || 0),
          esiAmount: Number(row.esiAmount || 0),
          pfAmount: Number(row.pfAmount || 0),
          professionalTax: Number(row.professionalTax || 0),
          salary: Number(row.salary || 0),
          status: row.status || "Processed",
          tdsAmount: Number(row.tdsAmount || 0),
        };
        return edits;
      }, {})
    );
    setMessage(`Payroll loaded from HRMS database for ${batch.month} / ${batch.department}.`);
  };
  const updatePayrollBatch = async (batch) => {
    if (!batch) return;

    const updatedRows = rows.map((row) => ({ ...row, status: "Processed" }));

    setSaving(true);
    try {
      const updatedBatch = await saveHrmsSalaryBatch({
        department,
        month,
        rows: updatedRows,
      });
      if (!updatedBatch) {
        throw new Error("No salary rows were returned from the HRMS database.");
      }
      if (batch.month !== month || batch.department !== department) {
        await deleteHrmsSalaryBatch(batch);
      }

      setPayrollBatches((current) => [
        updatedBatch,
        ...current.filter(
          (item) => item.id !== batch.id && item.id !== updatedBatch.id
        ),
      ]);
      setSelectedBatchId(updatedBatch.id);
      setMessage(`Payroll updated in HRMS database for ${month} / ${department}.`);
    } catch (error) {
      setMessage(
        getHrmsSalaryErrorMessage(
          error,
          "Could not update payroll in the HRMS database."
        )
      );
    } finally {
      setSaving(false);
    }
  };
  const deletePayrollBatch = async (batch) => {
    if (!batch) return;

    const confirmed = window.confirm(
      `Delete payroll batch ${batch.month} / ${batch.department}?`
    );

    if (!confirmed) return;

    setSaving(true);
    try {
      await deleteHrmsSalaryBatch(batch);
      setPayrollBatches((current) =>
        current.filter((item) => item.id !== batch.id)
      );
      if (selectedBatchId === batch.id) {
        setSelectedBatchId("");
        setGenerated(false);
      }
      setMessage(
        `Payroll deleted from HRMS database for ${batch.month} / ${batch.department}.`
      );
    } catch (error) {
      setMessage(
        getHrmsSalaryErrorMessage(
          error,
          "Could not delete payroll from the HRMS database."
        )
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4">
      <Panel>
        <div className="mb-4">
          <Notice tone={payrollNoticeTone}>{payrollNotice}</Notice>
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Field label="Month">
            <Input
              type="month"
              value={toAttendanceMonthInputValue(month)}
              onChange={(event) => {
                setMonth(
                  normalizeAttendanceMonth(event.target.value) ||
                    getCurrentAttendanceMonth()
                );
                setGenerated(false);
                setSelectedBatchId("");
                setSelectedEmployeeId("");
                setMessage("");
              }}
            />
          </Field>
          <Field label="Department">
            <Input
              as="select"
              value={department}
              onChange={(event) => {
                setDepartment(event.target.value);
                setGenerated(false);
                setSelectedBatchId("");
                setSelectedEmployeeId("");
                setMessage("");
              }}
            >
              <option>All</option>
              <option>IT</option>
              <option>HR</option>
              <option>Finance</option>
              <option>Marketing</option>
            </Input>
          </Field>
          <Button
            onClick={savePayroll}
            className="self-end"
            disabled={saving || !rows.length}
          >
            {saving ? "Saving..." : "Save Payroll"}
          </Button>
        </div>

        {selectedPayrollRow && (
          <div className="mt-5 grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[repeat(9,minmax(0,1fr))_auto]">
            <Field label="Select Employee">
              <Input
                as="select"
                value={selectedPayrollRow.id}
                onChange={(event) => {
                  setSelectedEmployeeId(event.target.value);
                  setMessage("");
                }}
              >
                {rows.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.id} - {row.name}
                  </option>
                ))}
              </Input>
            </Field>
            <Field label="Gross Salary">
              <Input
                type="number"
                min="0"
                value={selectedPayrollRow.salary}
                onChange={(event) => updatePayrollEdit("salary", event.target.value)}
              />
            </Field>
            <Field label="Monthly Salary">
              <Input value={money(selectedPayrollRow.monthlySalary)} disabled />
            </Field>
            <Field label="Allowances">
              <Input
                type="number"
                min="0"
                value={selectedPayrollRow.allowances}
                onChange={(event) => updatePayrollEdit("allowances", event.target.value)}
              />
            </Field>
            <Field label="Deduction">
              <Input
                type="number"
                min="0"
                value={selectedPayrollRow.deduction}
                onChange={(event) => updatePayrollEdit("deduction", event.target.value)}
              />
            </Field>
            <Field label="PF">
              <Input
                type="number"
                min="0"
                value={selectedPayrollRow.pfAmount}
                onChange={(event) => updatePayrollEdit("pfAmount", event.target.value)}
              />
            </Field>
            <Field label="ESI">
              <Input
                type="number"
                min="0"
                value={selectedPayrollRow.esiAmount}
                onChange={(event) => updatePayrollEdit("esiAmount", event.target.value)}
              />
            </Field>
            <Field label="TDS">
              <Input
                type="number"
                min="0"
                value={selectedPayrollRow.tdsAmount}
                onChange={(event) => updatePayrollEdit("tdsAmount", event.target.value)}
              />
            </Field>
            <Field label="PT">
              <Input
                type="number"
                min="0"
                value={selectedPayrollRow.professionalTax}
                onChange={(event) => updatePayrollEdit("professionalTax", event.target.value)}
              />
            </Field>
            <Field label="Status">
              <Input
                as="select"
                value={selectedPayrollRow.status}
                onChange={(event) => updatePayrollEdit("status", event.target.value)}
              >
                <option>Pending</option>
                <option>Processed</option>
              </Input>
            </Field>
            <Button
              onClick={savePayroll}
              className="self-end"
              disabled={saving || !rows.length}
            >
              {saving ? "Saving..." : "Save Edited Payroll"}
            </Button>
          </div>
        )}

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[1280px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {["ID", "Employee", "Gross Salary", "Monthly Salary", "Allowances", "Deduction", "PF", "ESI", "TDS", "PT", "Net Salary", "Status", "Action"].map((heading) => (
                  <th key={heading} className="px-3 py-3 font-bold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={selectedPayrollRow?.id === row.id ? "bg-blue-50/50" : ""}
                >
                  <td className="px-3 py-3 font-semibold">{row.id}</td>
                  <td className="px-3 py-3">{row.name}</td>
                  <td className="px-3 py-3">{money(row.salary)}</td>
                  <td className="px-3 py-3">{money(row.monthlySalary)}</td>
                  <td className="px-3 py-3">{money(row.allowances)}</td>
                  <td className="px-3 py-3">{money(row.deduction)}</td>
                  <td className="px-3 py-3">{money(row.pfAmount)}</td>
                  <td className="px-3 py-3">{money(row.esiAmount)}</td>
                  <td className="px-3 py-3">{money(row.tdsAmount)}</td>
                  <td className="px-3 py-3">{money(row.professionalTax)}</td>
                  <td className="px-3 py-3 font-bold">{money(row.net)}</td>
                  <td className="px-3 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-3 py-3">
                    <Button
                      className="min-h-8 px-2 text-xs"
                      variant="secondary"
                      onClick={() => setSelectedEmployeeId(row.id)}
                    >
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={13} className="px-3 py-8 text-center text-slate-500">
                    No employees found for this payroll selection.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel>
        <h2 className="text-base font-bold">Payroll Register</h2>
        <p className="mt-1 text-sm text-slate-500">
          Saved payroll batches from the HRMS database with load, update, and delete options.
        </p>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[920px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {["Saved Date", "Month", "Department", "Employees", "Net Total", "Status", "Action"].map((heading) => (
                  <th key={heading} className="px-3 py-3 font-bold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payrollBatches.map((batch) => {
                const netTotal = (batch.rows || []).reduce(
                  (sum, row) => sum + Number(row.net || 0),
                  0
                );

                return (
                  <tr
                    key={batch.id}
                    className={selectedBatchId === batch.id ? "bg-blue-50/50" : ""}
                  >
                    <td className="px-3 py-3">
                      {batch.updatedAt || batch.savedAt
                        ? formatDateTime(batch.updatedAt || batch.savedAt)
                        : "Not provided"}
                    </td>
                    <td className="px-3 py-3">{batch.month}</td>
                    <td className="px-3 py-3">{batch.department}</td>
                    <td className="px-3 py-3">{batch.rows?.length || 0}</td>
                    <td className="px-3 py-3 font-bold">{money(netTotal)}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={batch.status || "Processed"} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          className="min-h-8 px-2 text-xs"
                          variant="secondary"
                          onClick={() => loadPayrollBatch(batch)}
                        >
                          View
                        </Button>
                        <Button
                          className="min-h-8 px-2 text-xs"
                          onClick={() => updatePayrollBatch(batch)}
                          disabled={saving}
                        >
                          Update
                        </Button>
                        <Button
                          className="min-h-8 px-2 text-xs"
                          variant="danger"
                          onClick={() => deletePayrollBatch(batch)}
                          disabled={saving}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!payrollBatches.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    No payroll batches saved in the HRMS database yet. Generate payroll to create a register entry.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {selectedPayrollBatch && (
        <RegisterDocumentView
          title="PAYROLL REGISTER"
          subtitle={`${selectedPayrollBatch.month} | ${selectedPayrollBatch.department}`}
          onClose={() => setSelectedBatchId("")}
          leftRows={[
            ["Month", selectedPayrollBatch.month],
            ["Department", selectedPayrollBatch.department],
            ["Employees", selectedPayrollBatch.rows?.length || 0],
            [
              "Saved Date",
              selectedPayrollBatch.savedAt
                ? formatDateTime(selectedPayrollBatch.savedAt)
                : "Not provided",
            ],
          ]}
          rightRows={[
            [
              "Updated Date",
              selectedPayrollBatch.updatedAt
                ? formatDateTime(selectedPayrollBatch.updatedAt)
                : "Not updated",
            ],
            [
              "Total Gross",
              money(
                (selectedPayrollBatch.rows || []).reduce(
                  (sum, row) => sum + Number(row.salary || 0),
                  0
                )
              ),
            ],
            [
              "Total Allowances",
              money(
                (selectedPayrollBatch.rows || []).reduce(
                  (sum, row) => sum + Number(row.allowances || 0),
                  0
                )
              ),
            ],
            [
              "Total Deductions",
              money(
                (selectedPayrollBatch.rows || []).reduce(
                  (sum, row) =>
                    sum +
                    Number(
                      row.totalDeductions ??
                        Number(row.deduction || 0) +
                          Number(row.pfAmount || 0) +
                          Number(row.esiAmount || 0) +
                          Number(row.tdsAmount || 0) +
                          Number(row.professionalTax || 0)
                    ),
                  0
                )
              ),
            ],
            [
              "Net Total",
              money(
                (selectedPayrollBatch.rows || []).reduce(
                  (sum, row) => sum + Number(row.net || 0),
                  0
                )
              ),
            ],
          ]}
          tableColumns={[
            "Employee ID",
            "Employee",
            "Gross Salary",
            "Monthly Salary",
            "Allowances",
            "Deduction",
            "PF",
            "ESI",
            "TDS",
            "PT",
            "Net Pay",
            "Status",
          ]}
          tableRows={(selectedPayrollBatch.rows || []).map((row) => ({
            id: row.id,
            values: [
              row.id,
              row.name,
              money(row.salary),
              money(row.monthlySalary ?? calculateMonthlySalary(row.salary)),
              money(row.allowances),
              money(row.deduction),
              money(row.pfAmount),
              money(row.esiAmount),
              money(row.tdsAmount),
              money(row.professionalTax),
              money(row.net),
              row.status,
            ],
          }))}
          bottomLeftTitle="Payroll Notes"
          bottomLeftValue="Registered payroll details saved from the HRMS database."
        />
      )}
    </div>
  );
};

const PayslipPage = () => {
  const [employees] = useHrmsEmployees();
  const [payrollBatches, , payrollState] = useHrmsSalaries();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [month, setMonth] = useState(getCurrentAttendanceMonth());
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("success");
  const [payslip, setPayslip] = useState(null);
  const selectedEmployee =
    employees.find((employee) => employee.id === selectedEmployeeId) || null;
  const employee = payslip?.employee || null;
  const payrollRow = payslip?.payrollRow || null;
  const payrollBreakup = payslip
    ? getSalaryBreakup(payrollRow || {}, payrollRow?.salary)
    : null;
  const earnings = payslip
    ? [
        ["Gross Salary", payrollBreakup.grossSalary],
        ["Monthly Salary", payrollBreakup.monthlySalary],
        ["Allowances", payrollBreakup.allowances],
      ]
    : [];
  const deductions = payslip
    ? [
        ["Deduction", payrollBreakup.deduction],
        ["PF", payrollBreakup.pfAmount],
        ["ESI", payrollBreakup.esiAmount],
        ["TDS", payrollBreakup.tdsAmount],
        ["Professional Tax", payrollBreakup.professionalTax],
      ]
    : [];
  const totalEarnings = earnings.reduce((sum, [, value]) => sum + value, 0);
  const totalDeductions = deductions.reduce((sum, [, value]) => sum + value, 0);
  const netPay = payslip ? payrollBreakup.netSalary : 0;

  useEffect(() => {
    if (!selectedEmployeeId && employees[0]?.id) {
      setSelectedEmployeeId(employees[0].id);
    }
  }, [employees, selectedEmployeeId]);

  const buildPayslip = () => {
    if (!selectedEmployee) {
      setMessageTone("warning");
      setMessage("Select an employee before creating a payslip.");
      setPayslip(null);
      return null;
    }

    const matchingBatch = [...payrollBatches]
      .sort((first, second) =>
        String(second.updatedAt || second.savedAt || "").localeCompare(
          String(first.updatedAt || first.savedAt || "")
        )
      )
      .find(
        (batch) =>
          areAttendanceMonthsEqual(batch.month, month) &&
          (batch.rows || []).some((row) => row.id === selectedEmployee.id)
      );
    const savedRow = matchingBatch?.rows?.find(
      (row) => row.id === selectedEmployee.id
    );
    const fallbackBreakup = getSalaryBreakup(selectedEmployee);
    const fallbackRow = {
      ...selectedEmployee,
      allowance: fallbackBreakup.allowances,
      allowances: fallbackBreakup.allowances,
      deduction: fallbackBreakup.deduction,
      esiAmount: fallbackBreakup.esiAmount,
      net: fallbackBreakup.netSalary,
      pfAmount: fallbackBreakup.pfAmount,
      professionalTax: fallbackBreakup.professionalTax,
      salary: fallbackBreakup.grossSalary,
      tdsAmount: fallbackBreakup.tdsAmount,
      totalDeductions: fallbackBreakup.totalDeductions,
      status: "Pending",
    };

    const nextPayslip = {
      batch: matchingBatch || null,
      employee: selectedEmployee,
      month,
      payrollRow: savedRow || fallbackRow,
    };

    setPayslip(nextPayslip);
    setMessageTone(savedRow ? "success" : "warning");
    setMessage(
      savedRow
        ? `Payslip created for ${selectedEmployee.name} from HRMS database payroll.`
        : `No saved payroll found in the HRMS database for ${selectedEmployee.name} in ${month}. Showing fallback values. Save payroll first for registered payslip data.`
    );
    return nextPayslip;
  };

  const createPayslip = () => {
    buildPayslip();
  };

  const downloadPayslip = () => {
    const nextPayslip = buildPayslip();
    if (!nextPayslip) return;

    window.setTimeout(() => window.print(), 0);
  };

  return (
    <div className="grid gap-4">
      <Panel>
        <div className="mb-4">
          <Notice tone={messageTone}>{message}</Notice>
          {payrollState.error && (
            <Notice tone="warning">{payrollState.error}</Notice>
          )}
          {payrollState.loading && !payrollBatches.length && (
            <Notice>Loading payroll from HRMS database...</Notice>
          )}
          {!employees.length && (
            <Notice tone="warning">Add an employee before generating a payslip.</Notice>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Field label="Employee">
            <Input
              as="select"
              value={selectedEmployeeId}
              onChange={(event) => {
                setSelectedEmployeeId(event.target.value);
                setPayslip(null);
                setMessage("");
              }}
            >
              <option value="">Select Employee</option>
              {employees.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.id} - {record.name}
                </option>
              ))}
            </Input>
          </Field>
          <Field label="Month">
            <Input
              type="month"
              value={toAttendanceMonthInputValue(month)}
              onChange={(event) => {
                setMonth(
                  normalizeAttendanceMonth(event.target.value) ||
                    getCurrentAttendanceMonth()
                );
                setPayslip(null);
                setMessage("");
              }}
            />
          </Field>
          <Button onClick={createPayslip} className="self-end">
            Create Payslip
          </Button>
        </div>
      </Panel>

      <Panel id="payslip-print-area">
        <div className="flex justify-end">
          <Button onClick={downloadPayslip} disabled={!selectedEmployee}>
            <AppIcon name="download" className="h-4 w-4" />
            Download PDF
          </Button>
        </div>

        {!payslip ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            Select an employee and month, then create the payslip.
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-4 border-b border-slate-200 pb-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="flex gap-4">
                <Avatar
                  initials={employee?.avatar || getInitials(employee?.name)}
                  size="lg"
                  src={employee?.photo}
                />
                <div>
                  <h2 className="text-xl font-bold">
                    {employee?.name || "No employee selected"}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {employee?.id || "Not provided"}
                  </p>
                  <p className="text-sm text-slate-500">
                    {employee?.designation || "Not provided"}
                  </p>
                </div>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                {[
                  ["Department", displayValue(employee?.department)],
                  ["Month", payslip.month],
                  ["Date of Joining", displayValue(employee?.joined)],
                  ["Days Worked", "26"],
                  ["Document Number", displayValue(employee?.documentNumber)],
                  ["Payment Date", getPayrollPaymentDate(payslip.month)],
                  ["Payroll Status", payrollRow?.status || "Pending"],
                  ["Payroll Ref", payslip.batch?.id || "Not saved"],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[120px_1fr] gap-3">
                    <span className="text-slate-500">{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <PayrollBox title="Earnings" rows={earnings} totalLabel="Total Earnings" total={totalEarnings} />
              <PayrollBox title="Deductions" rows={deductions} totalLabel="Total Deductions" total={totalDeductions} />
            </div>
            <div className="mt-5 flex items-center justify-between rounded-md bg-blue-700 px-4 py-3 font-bold text-white">
              <span>Net Pay</span>
              <span>{money(netPay)}</span>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
};

const PayrollBox = ({ title, rows, totalLabel, total }) => (
  <div className="rounded-lg border border-slate-200">
    <h3 className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold">
      {title}
    </h3>
    <div className="grid gap-2 p-4 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4">
          <span>{label}</span>
          <strong>{money(value)}</strong>
        </div>
      ))}
      <div className="mt-2 flex justify-between gap-4 border-t border-slate-100 pt-3 font-bold">
        <span>{totalLabel}</span>
        <span>{money(total)}</span>
      </div>
    </div>
  </div>
);

const RelievingLetterDocument = ({ record, employee }) => {
  const letter = getRelievingLetterData(record, employee);
  const checklist = Array.isArray(record?.checklist) ? record.checklist : [];

  return (
    <article className="rounded-md border border-slate-300 bg-white p-5 text-sm leading-7 text-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-blue-700 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-950">
            Bangalore Electronics
          </h2>
          <p className="text-xs font-semibold text-slate-500">
            Human Resources Department
          </p>
        </div>
        <div className="text-right text-xs font-semibold text-slate-600">
          <p>Date: {letter.letterDate}</p>
          <p>Ref: {letter.referenceNo}</p>
        </div>
      </div>

      <h3 className="mt-6 text-center text-lg font-bold uppercase tracking-wide text-slate-950">
        Relieving Letter
      </h3>

      <div className="mt-5 grid gap-2 rounded-md bg-slate-50 p-4 text-xs sm:grid-cols-2">
        {letter.rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[120px_1fr] gap-2">
            <span className="font-semibold text-slate-500">{label}</span>
            <strong className="text-slate-900">{value}</strong>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-3">
        {letter.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="border border-slate-200 px-3 py-2">
                Checklist Item
              </th>
              <th className="border border-slate-200 px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {checklist.map((item) => (
              <tr key={item.label}>
                <td className="border border-slate-200 px-3 py-2 font-semibold">
                  {item.label}
                </td>
                <td className="border border-slate-200 px-3 py-2">
                  <span
                    className={[
                      "inline-flex rounded-full px-2 py-1 text-[11px] font-bold",
                      item.checked
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700",
                    ].join(" ")}
                  >
                    {item.checked ? "Completed" : "Pending"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-12 grid gap-8 text-xs font-semibold text-slate-600 sm:grid-cols-2">
        <div className="border-t border-slate-400 pt-2">Employee Signature</div>
        <div className="border-t border-slate-400 pt-2 text-right">
          Authorised HR Signatory
        </div>
      </div>
    </article>
  );
};

const RelievingPage = () => {
  const [employees, setEmployees] = useHrmsEmployees();
  const [relievingRecords, setRelievingRecords, relievingState] =
    useHrmsRelieving();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(
    employees[0]?.id || ""
  );
  const employee =
    employees.find((record) => record.id === selectedEmployeeId) ||
    employees[0] ||
    null;
  const [registeredRelievingRecord, setRegisteredRelievingRecord] =
    useState(null);
  const [selectedRelievingRecord, setSelectedRelievingRecord] = useState(null);
  const [items, setItems] = useState([
    ["Handover Documents", true],
    ["Clear Pending Tasks", true],
    ["Return Company Assets", true],
    ["Exit Interview", true],
    ["Final Settlement", true],
  ]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const employeeId = employee?.id;
  const relievingRegisterRows = useMemo(() => {
    const employeeById = new Map(employees.map((item) => [item.id, item]));
    const rowsByEmployee = new Map();

    relievingRecords.forEach((record) => {
      const recordEmployee = employeeById.get(record.employeeId);
      rowsByEmployee.set(record.employeeId || record.id, {
        employeeId: record.employeeId,
        employeeName:
          record.employeeName || recordEmployee?.name || "Not provided",
        lastWorkingDate: record.lastWorkingDate,
        record,
        resignationDate: record.resignationDate,
        status: record.status || recordEmployee?.status || "Relieved",
      });
    });

    employees
      .filter((item) => String(item.status || "").toLowerCase() === "relieved")
      .forEach((item) => {
        if (rowsByEmployee.has(item.id)) return;
        rowsByEmployee.set(item.id, {
          employeeId: item.id,
          employeeName: item.name,
          lastWorkingDate: "",
          record: null,
          resignationDate: "",
          status: item.status,
        });
      });

    return Array.from(rowsByEmployee.values()).sort((first, second) =>
      String(second.lastWorkingDate || second.resignationDate || "").localeCompare(
        String(first.lastWorkingDate || first.resignationDate || "")
      )
    );
  }, [employees, relievingRecords]);

  const existingRegisteredRecord = useMemo(
    () =>
      employeeId
        ? relievingRecords.find((record) => record.employeeId === employeeId)
        : null,
    [employeeId, relievingRecords]
  );
  const recentRegisteredRecord =
    registeredRelievingRecord?.employeeId === employeeId
      ? registeredRelievingRecord
      : null;
  const activeSelectedRelievingRecord =
    selectedRelievingRecord?.employeeId === employeeId
      ? selectedRelievingRecord
      : null;
  const selectedLetterEmployee =
    employees.find((item) => item.id === activeSelectedRelievingRecord?.employeeId) ||
    employee;
  const registeredRecord = recentRegisteredRecord || existingRegisteredRecord;
  const relievingDetails = registeredRecord || {
    lastWorkingDate: "10/06/2024",
    noticePeriod: "30 Days",
    resignationDate: "10/05/2024",
  };

  useEffect(() => {
    if (!selectedEmployeeId && employees[0]?.id) {
      setSelectedEmployeeId(employees[0].id);
    }
  }, [employees, selectedEmployeeId]);

  const processRelieving = async () => {
    if (!employee) {
      setMessage("Add an employee before processing relieving.");
      return;
    }

    const referenceNo = `REL-${Date.now()}`;
    const payload = {
      referenceNo,
      id: referenceNo,
      employeeId: employee.id,
      employeeName: employee.name,
      checklist: items.map(([label, checked]) => ({ label, checked })),
      lastWorkingDate: "10/06/2024",
      noticePeriod: "30 Days",
      resignationDate: "10/05/2024",
      status: "Relieved",
      letterGenerated: true,
    };

    setSaving(true);
    try {
      const record = await createHrmsRelieving(payload);
      setRelievingRecords((current) => [record, ...current]);
      setRegisteredRelievingRecord(record);
      setSelectedRelievingRecord(null);

      let employeeStatusMessage = "";
      try {
        const updatedEmployee = await updateHrmsEmployee(employee.id, {
          status: "Relieved",
        });
        setEmployees((current) =>
          current.map((item) =>
            item.id === employee.id ? { ...item, ...updatedEmployee } : item
          )
        );
      } catch (employeeError) {
        employeeStatusMessage = ` ${getHrmsEmployeeErrorMessage(
          employeeError,
          "Employee status could not be updated."
        )}`;
      }

      setMessage(
        `${employee.name} relieving process saved to HRMS database. Registered form is ready below.${employeeStatusMessage}`
      );
    } catch (error) {
      setMessage(
        getHrmsRelievingErrorMessage(
          error,
          "Could not save relieving record to the HRMS database."
        )
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4">
      <Notice
        tone={
          relievingState.error || /^(Add|Could not|Employee status)/.test(message)
            ? "warning"
            : "success"
        }
      >
        {relievingState.error ||
          message ||
          (relievingState.loading
            ? "Loading relieving records from HRMS database..."
            : "")}
      </Notice>
      {!employee && (
        <Panel>
          <Notice tone="warning">No employee records are available.</Notice>
          <Link to="/employees/add">
            <Button className="mt-4">
              <AppIcon name="plus" className="h-4 w-4" />
              Add Employee
            </Button>
          </Link>
        </Panel>
      )}
      {employees.length ? (
        <Panel>
          <Field label="Employee">
            <Input
              as="select"
              value={employee?.id || selectedEmployeeId}
              onChange={(event) => {
                setSelectedEmployeeId(event.target.value);
                setSelectedRelievingRecord(null);
                setMessage("");
              }}
            >
              {employees.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.id} - {record.name} ({record.status || "Active"})
                </option>
              ))}
            </Input>
          </Field>
        </Panel>
      ) : null}
      {employee && (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)]">
      <Panel>
        <div className="grid gap-6 md:grid-cols-[180px_minmax(0,1fr)]">
          <div className="grid justify-items-center border-r border-slate-100 text-center">
            <Avatar initials={employee.avatar} size="lg" src={employee.photo} />
            <h2 className="mt-3 text-lg font-bold">{employee.name}</h2>
            <p className="text-sm text-slate-500">{employee.id}</p>
            <p className="text-sm text-slate-500">{employee.designation}</p>
            <p className="text-sm text-slate-500">{employee.department}</p>
          </div>
          <div className="grid gap-3 text-sm">
            {[
              ["Resignation Date", relievingDetails.resignationDate],
              ["Last Working Date", relievingDetails.lastWorkingDate],
              ["Notice Period", relievingDetails.noticePeriod],
              ["Relieving Status", employee.status === "Relieved" ? "Relieved" : "Pending"],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[150px_1fr] gap-3">
                <span className="text-slate-500">{label}</span>
                <strong
                  className={
                    value === "Pending" ? "text-amber-600" : "text-emerald-600"
                  }
                >
                  {value}
                </strong>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel>
        <h2 className="text-sm font-bold">Relieving Checklist</h2>
        <div className="mt-4 grid gap-3">
          {items.map(([label, checked], index) => (
            <label key={label} className="flex items-center gap-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  setItems((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? [item[0], event.target.checked] : item
                    )
                  )
                }
                className="h-4 w-4 rounded border-slate-300 text-blue-700"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setItems((current) => current.map(([label]) => [label, false]));
              setMessage("");
            }}
          >
            Cancel
          </Button>
          <Button onClick={processRelieving} disabled={saving}>
            {saving ? "Processing..." : "Process Relieving"}
          </Button>
        </div>
      </Panel>
      </div>
      )}
      {employee && registeredRecord && (
        <Panel className="border-emerald-200 bg-emerald-50/70">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="inline-grid h-11 w-11 place-items-center rounded-full bg-emerald-600 text-white">
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.4"
                >
                  <path d="M5 12.5l4 4L19 7" />
                </svg>
              </span>
              <div>
                <h2 className="text-sm font-bold text-emerald-900">
                  Relieving processed
                </h2>
                <p className="text-sm font-semibold text-emerald-700">
                  Registered form {registeredRecord.id} is available.
                </p>
              </div>
            </div>
            <Button onClick={() => setSelectedRelievingRecord(registeredRecord)}>
              <AppIcon name="file" className="h-4 w-4" />
              Registered Form
            </Button>
          </div>
        </Panel>
      )}
      <Panel>
        <div>
          <h2 className="text-base font-bold">Exit Employee List</h2>
          <p className="mt-1 text-sm text-slate-500">
            Relieved employees and saved relieving records from the HRMS database.
          </p>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[820px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {["Employee", "Resignation Date", "Last Working Date", "Status", "Record", "Action"].map((heading) => (
                  <th key={heading} className="px-3 py-3 font-bold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {relievingRegisterRows.map((row) => (
                <tr key={`${row.employeeId || "record"}-${row.record?.id || "employee"}`}>
                  <td className="px-3 py-3">
                    <strong>{row.employeeName}</strong>
                    <p className="text-xs text-slate-500">{displayValue(row.employeeId)}</p>
                  </td>
                  <td className="px-3 py-3">{formatDate(row.resignationDate)}</td>
                  <td className="px-3 py-3">{formatDate(row.lastWorkingDate)}</td>
                  <td className="px-3 py-3">
                    <StatusBadge status={row.status || "Relieved"} />
                  </td>
                  <td className="px-3 py-3">{row.record?.id || "No form saved"}</td>
                  <td className="px-3 py-3">
                    <Button
                      className="min-h-8 px-2 text-xs"
                      variant="secondary"
                      onClick={() => {
                        if (row.employeeId) {
                          setSelectedEmployeeId(row.employeeId);
                        }
                        if (row.record) {
                          setSelectedRelievingRecord(row.record);
                        }
                      }}
                    >
                      {row.record ? "View Letter" : "Select"}
                    </Button>
                  </td>
                </tr>
              ))}
              {!relievingRegisterRows.length && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    No exited employees found. Process relieving to create an exit record.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
      {employee && activeSelectedRelievingRecord && (
        <Panel id="relieving-letter-print-area">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold">Relieving Letter</h2>
              <p className="text-xs font-semibold text-slate-500">
                {activeSelectedRelievingRecord.employeeName} -{" "}
                {activeSelectedRelievingRecord.id}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() =>
                  printRelievingLetter(activeSelectedRelievingRecord, selectedLetterEmployee)
                }
              >
                <AppIcon name="file" className="h-4 w-4" />
                Print
              </Button>
              <Button
                onClick={() =>
                  printRelievingLetter(activeSelectedRelievingRecord, selectedLetterEmployee)
                }
              >
                <AppIcon name="download" className="h-4 w-4" />
                PDF
              </Button>
              <Button
                variant="ghost"
                onClick={() => setSelectedRelievingRecord(null)}
              >
                <AppIcon name="x" className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <RelievingLetterDocument
            record={activeSelectedRelievingRecord}
            employee={selectedLetterEmployee}
          />
        </Panel>
      )}
    </div>
  );
};

const SearchPage = () => {
  const [employees] = useHrmsEmployees();
  const [filters, setFilters] = useState({
    employeeId: "",
    name: "",
    department: "",
    designation: "",
    status: "",
    phone: "",
  });

  const results = useMemo(() => {
    const terms = Object.values(filters)
      .map((value) => String(value).trim().toLowerCase())
      .filter(Boolean);
    if (!terms.length) return employees.slice(0, 1);
    return employees.filter((employee) => {
      const haystack = Object.values(employee).join(" ").toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [filters]);

  const updateFilter = (key, value) =>
    setFilters((current) => ({ ...current, [key]: value }));

  return (
    <div className="grid gap-4">
      <Panel>
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
          <Field label="Employee ID">
            <Input
              value={filters.employeeId}
              onChange={(event) => updateFilter("employeeId", event.target.value)}
              placeholder="Enter ID"
            />
          </Field>
          <Field label="Name">
            <Input
              value={filters.name}
              onChange={(event) => updateFilter("name", event.target.value)}
              placeholder="Enter name"
            />
          </Field>
          <Field label="Department">
            <Input
              value={filters.department}
              onChange={(event) => updateFilter("department", event.target.value)}
              placeholder="Select Department"
            />
          </Field>
          <Field label="Designation">
            <Input
              value={filters.designation}
              onChange={(event) => updateFilter("designation", event.target.value)}
              placeholder="Select Designation"
            />
          </Field>
          <Field label="Status">
            <Input
              value={filters.status}
              onChange={(event) => updateFilter("status", event.target.value)}
              placeholder="Select Status"
            />
          </Field>
          <Field label="Phone Number">
            <Input
              value={filters.phone}
              onChange={(event) => updateFilter("phone", event.target.value)}
              placeholder="Enter phone number"
            />
          </Field>
          <div className="self-end">
            <Button className="w-full">
              <AppIcon name="search" className="h-4 w-4" />
              Search
            </Button>
          </div>
        </div>
      </Panel>

      <Panel>
        <h2 className="text-sm font-bold">Search Results</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {["ID", "Name", "Department", "Designation", "Phone", "Status", "Action"].map((heading) => (
                  <th key={heading} className="px-3 py-3 font-bold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {results.map((employee) => (
                <tr key={employee.id}>
                  <td className="px-3 py-3 font-semibold">{employee.id}</td>
                  <td className="px-3 py-3">{employee.name}</td>
                  <td className="px-3 py-3">{employee.department}</td>
                  <td className="px-3 py-3">{employee.designation}</td>
                  <td className="px-3 py-3">{employee.phone}</td>
                  <td className="px-3 py-3">
                    <StatusBadge status={employee.status} />
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      to={`/employees/profile/${employee.id}`}
                      className="text-blue-700"
                    >
                      <AppIcon name="user" className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
};

const HrmsReportsPage = () => {
  const [, setGeneratedReports] = useStoredList(HRMS_STORAGE_KEYS.reports, []);
  const [message, setMessage] = useState("");
  const reports = [
    ["Employee Report", "View Employee Details", "file"],
    ["Attendance Report", "View Attendance Details", "clock"],
    ["Payroll Report", "View Payroll Details", "receipt"],
    ["Review Report", "View Review Details", "clipboard"],
    ["Relieving Report", "View Relieving Details", "logout"],
    ["Salary Summary", "View Salary Summary", "chart"],
  ];
  const generateReport = (title) => {
    setGeneratedReports((current) => [
      {
        id: `RPT-${Date.now()}`,
        title,
        generatedAt: new Date().toISOString(),
      },
      ...current,
    ]);
    setMessage(`${title} generated and saved locally.`);
  };

  return (
    <div className="grid gap-4">
      <Notice>{message}</Notice>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {reports.map(([title, description, icon]) => (
          <Panel key={title} className="min-h-36">
            <div className="flex gap-4">
              <span className="grid h-12 w-12 place-items-center rounded-md bg-blue-50 text-blue-700">
                <AppIcon name={icon} className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-bold">{title}</h2>
                <p className="mt-1 text-sm text-slate-500">{description}</p>
                <Button
                  className="mt-4 min-h-8 px-3 text-xs"
                  onClick={() => generateReport(title)}
                >
                  Generate
                </Button>
              </div>
            </div>
          </Panel>
        ))}
      </section>
    </div>
  );
};

const PermissionsPage = () => {
  const roles = [
    ["Admin", "Full access", "Dashboard, employees, payroll, reports, settings"],
    ["HR Manager", "HR access", "Employees, reviews, relieving, reports"],
    ["Payroll Officer", "Payroll access", "Attendance, payroll, payslip"],
    ["Manager", "Team access", "Reviews and employee profiles"],
    ["Employee", "Self service", "Profile and payslip"],
  ];

  return (
    <Panel>
      <div className="overflow-x-auto">
        <table className="min-w-[720px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              {["Role", "Access Level", "Permissions"].map((heading) => (
                <th key={heading} className="px-3 py-3 font-bold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {roles.map(([role, level, permissions]) => (
              <tr key={role}>
                <td className="px-3 py-3 font-bold">{role}</td>
                <td className="px-3 py-3">{level}</td>
                <td className="px-3 py-3 text-slate-600">{permissions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
};

const renderPage = (page) => {
  switch (page) {
    case "dashboard":
      return <DashboardPage />;
    case "employees":
      return <EmployeeListPage />;
    case "add-employee":
      return <AddEmployeePage />;
    case "edit-employee":
      return <EditEmployeePage />;
    case "employee-profile":
      return <EmployeeProfilePage />;
    case "reviews":
      return <ReviewsPage />;
    case "salary-reassessment":
      return <SalaryReassessmentPage />;
    case "attendance":
      return <AttendancePage />;
    case "payroll":
      return <PayrollPage />;
    case "payslip":
      return <PayslipPage />;
    case "relieving":
      return <RelievingPage />;
    case "search":
      return <SearchPage />;
    case "reports":
      return <HrmsReportsPage />;
    case "permissions":
      return <PermissionsPage />;
    default:
      return <DashboardPage />;
  }
};

const HrmsPlaceholder = ({ page }) => {
  if (page === "login") {
    return <HrmsLoginPage />;
  }

  return <HrmsShell>{renderPage(page)}</HrmsShell>;
};

export default HrmsPlaceholder;
