# HRMS Codebase Analysis - Comprehensive Summary

## 1. BACKEND STRUCTURE

### Database Configuration
- **HRMS Database**: Configured via environment variables (`HRMS_DB_NAME` or `HRMS_DB_DATABASE`), defaults to `"HRMS_DB"`
- **Location**: SQL Server database with schema in `[HRMS_DB].[dbo]`
- **File**: [backend/src/server.js](backend/src/server.js)

### HRMS Database Schema

#### Employee-Related Tables

**1. Employees Table**
- **Location**: `[HRMS_DB].[dbo].[Employees]`
- **Current Fields** (as per server.js line 7576-7625):
  - `EmployeeID` (Primary Key)
  - `FullName`
  - `Email`
  - `PhoneNumber`
  - `DateOfJoining`
  - `DepartmentID` (Foreign Key)
  - `DesignationID` (Foreign Key)
  - `BasicSalary`
  - `ReportingManager`
  - `Status`
  - `EmergencyContactNumber` (Added via ALTER)
  - `DocumentsJson` (Added via ALTER - NVARCHAR(MAX) for JSON storage)
  - `SalaryDeduction` (DECIMAL(18,2))
  - `ProvidentFund` (DECIMAL(18,2))
  - `ESIAmount` (DECIMAL(18,2))
  - `EmergencyContactRelation` (NVARCHAR(50)) - Added for employee module enhancement
  - `PANNumber` (NVARCHAR(10)) - Added for employee module enhancement
  - `UANNumber` (NVARCHAR(12)) - Added for HRMS validations
  - `TDS` (DECIMAL(18,2)) - Added for salary processing enhancement
  - `Allowances` (DECIMAL(18,2)) - Added for salary processing enhancement

**2. Departments Table**
- **Location**: `[HRMS_DB].[dbo].[Departments]`
- **Fields**: `DepartmentID` (Primary Key), `DepartmentName`

**3. Designations Table**
- **Location**: `[HRMS_DB].[dbo].[Designations]`
- **Fields**: `DesignationID` (Primary Key), `DesignationTitle`

**4. EmployeeIdSequences Table**
- **Purpose**: Auto-generate employee IDs with prefix 'BE'
- **Fields**: `Prefix`, `LastNumber`, `UpdatedAt`
- **Pattern**: Generates IDs like BE001, BE002, etc.

#### Supporting HRMS Tables

**5. Attendance Table**
- Stores employee attendance records
- Fields include: `EmployeeID`, Date-based status (P/A/L/H)

**6. Reviews Table**
- Performance review records
- Fields: `EmployeeID`, `ReviewPeriod`, `OverallRating`, `ReviewType`, `ReviewerName`

**7. Salaries Table**
- Salary batch processing and payroll
- Fields: `EmployeeID`, `Month`, `BasicSalary`, `Deductions`, `GrossSalary`, `NetSalary`

**8. SalaryReassessments Table**
- Salary revision and promotion history
- Fields: `EmployeeID`, `PreviousSalary`, `NewSalary`, `EffectiveDate`, `Reason`

**9. Relieving Table**
- Employee exit/relieving records
- Fields: `EmployeeID`, `RelievingDate`, `ExitReason`, `ChecklistItems`, `Status`

### Backend API Endpoints

**Location**: [backend/src/server.js](backend/src/server.js)

#### Employee Endpoints
- `GET /api/hrms/employees` (Line 9907) - Fetch all employees
- `GET /api/hrms/employees/:id` (Line 9958) - Fetch single employee
- `POST /api/hrms/employees` (Line 9978) - Create new employee
- `PUT /api/hrms/employees/:id` (Line 10093) - Update employee
- `DELETE /api/hrms/employees/:id` (Line 10184) - Delete employee

#### Attendance Endpoints
- `GET /api/hrms/attendance` (Line 8973) - Fetch attendance records
- `POST /api/hrms/attendance` (Line 8999) - Save/update attendance

#### Reviews Endpoints
- `GET /api/hrms/reviews` (Line 8006) - Fetch all reviews
- `POST /api/hrms/reviews` (Line 8041) - Create review

#### Salary Endpoints
- `GET /api/hrms/salaries` (Line 9413) - Fetch salary batches
- `POST /api/hrms/salaries` (Line 9447) - Save salary batch
- `DELETE /api/hrms/salaries` (Line 9504) - Delete salary batch

#### Salary Reassessment Endpoints
- `GET /api/hrms/salary-reassessments` (Line 8543) - Fetch reassessments
- `POST /api/hrms/salary-reassessments` (Line 8571) - Create reassessment
- `PUT /api/hrms/salary-reassessments/:id` (Line 8696) - Update reassessment
- `DELETE /api/hrms/salary-reassessments/:id` (Line 8792) - Delete reassessment

#### Relieving Endpoints
- `GET /api/hrms/relieving` (Line 9765) - Fetch relieving records
- `POST /api/hrms/relieving` (Line 9791) - Create relieving record

---

## 2. FRONTEND HRMS PAGES

### Main HRMS Hub
- **File**: [src/pages/HrmsPlaceholder.jsx](src/pages/HrmsPlaceholder.jsx) (Main HRMS page - ~6800+ lines)
- **Purpose**: Central hub containing all HRMS functionality with multiple tabs/sections

### Page Components & Routes

#### Employee Management Pages
- **Employee List Page** (`/employees`): Display all employees with table view
- **Employee Profile Page** (`/employees/profile`): View complete employee details
- **Create Employee Page** (`/employees/new`): Form to add new employee
- **Edit Employee Page** (`/employees/edit`): Form to update employee information

#### Attendance Management
- **Attendance Calendar** (`/attendance`): Month-wise calendar view for marking attendance
- Mark attendance with statuses: P (Present), A (Absent), L (Leave), H (Holiday)

#### Payroll Management
- **Payroll Processing** (`/salaries`): Monthly salary batch creation and processing
- **Payslip Generation**: Create and download individual employee payslips as PDF
- **Salary Components**: Display gross salary, deductions, PF, ESI, net salary

#### Performance Management
- **Review Module** (`/reviews`): Performance review creation and management
- **Salary Reassessment** (`/salary-reassessment`): Performance-based salary revision
  - Review score calculation
  - Metrics: Work Quality, Communication, Teamwork, Leadership, Punctuality, Task Completion, Innovation, Client Feedback, Reporting, Skill Development
  - Promotion readiness assessment

#### Employee Exit Management
- **Relieving Records** (`/relieving`): Employee exit/resignation management
- **Relieving Letter** (`/relieving/letters`): Generate relieving and experience letters
- **Final Settlement** (`/relieving/final-settlement`): Calculate final settlement

#### Reports
- **HRMS Reports** (`/reports`): Generate and download various reports
  - Employee Report
  - Attendance Report
  - Payroll Report
  - Review Report
  - Relieving Report
  - Salary Summary

---

## 3. FRONTEND SERVICES & API CALLS

### Service Files Location
All services are in: [src/services/](src/services/)

#### 1. Employee Management Services
**File**: [src/services/hrmsEmployeesApi.js](src/services/hrmsEmployeesApi.js)

**Key Functions**:
- `fetchHrmsEmployees()` - GET all employees
- `createHrmsEmployee(payload)` - POST new employee
- `updateHrmsEmployee(id, payload)` - PUT employee
- `deleteHrmsEmployee(id)` - DELETE employee
- `normalizeHrmsEmployee(employee)` - Normalize employee data structure
- `getHrmsEmployeeErrorMessage(error, fallback)` - Error handling

**Normalization Handles**: 
- Multiple field name variations (id/employeeId/EmployeeID, name/fullName/FullName, etc.)
- Documents JSON parsing
- Salary breakup (salary, deduction, PF, ESI)
- Date formatting (DD/MM/YYYY)
- Avatar generation from initials

**Event Emitting**: 
- Emits `"hrms:employees:changed"` event on create/update/delete

#### 2. Attendance Services
**File**: [src/services/hrmsAttendanceApi.js](src/services/hrmsAttendanceApi.js)

**Key Functions**:
- `fetchHrmsAttendance()` - GET attendance records
- `saveHrmsAttendance(payload)` - POST/PUT attendance
- `normalizeStatus(value)` - Normalize P/A/L/H statuses
- `parseStatuses(value)` - Parse JSON/array statuses
- `buildCounts(statuses)` - Generate P/A/L/H counts
- `getHrmsAttendanceErrorMessage(error, fallback)` - Error handling

**Default Statuses**: 31-day array of "P" (Present)

#### 3. Review Services
**File**: [src/services/hrmsReviewsApi.js](src/services/hrmsReviewsApi.js)

**Key Functions**:
- `fetchHrmsReviews()` - GET all reviews
- `createHrmsReview(payload)` - POST review
- `normalizeHrmsReview(review)` - Normalize review data
- `getHrmsReviewErrorMessage(error, fallback)` - Error handling

**Review Fields**: `employeeId`, `employeeName`, `period`, `type`, `reviewer`, `rating`, `strengths`, `improvement`, `comments`, `savedAt`

#### 4. Salary Services
**File**: [src/services/hrmsSalariesApi.js](src/services/hrmsSalariesApi.js)

**Key Functions**:
- `fetchHrmsSalaryBatches()` - GET salary batches
- `saveHrmsSalaryBatch(payload)` - POST/PUT salary batch
- `deleteHrmsSalaryBatch(id)` - DELETE salary batch
- `normalizeHrmsSalary(record)` - Normalize salary data
- `calculatePfAmount(grossSalary)` - 12% of gross salary
- `calculateEsiAmount(grossSalary)` - 1.5% of gross salary
- `getHrmsSalaryErrorMessage(error, fallback)` - Error handling

**Salary Calculations**:
- PF: 12% of gross salary
- ESI: 1.5% of gross salary
- Net Salary: Gross - (Deduction + PF + ESI)

#### 5. Salary Reassessment Services
**File**: [src/services/hrmsSalaryReassessmentsApi.js](src/services/hrmsSalaryReassessmentsApi.js)

**Key Functions**:
- `fetchHrmsSalaryReassessments()` - GET reassessments
- `createHrmsSalaryReassessment(payload)` - POST reassessment
- `updateHrmsSalaryReassessment(id, payload)` - PUT reassessment
- `deleteHrmsSalaryReassessment(id)` - DELETE reassessment
- `normalizeHrmsSalaryReassessment(record)` - Normalize data
- `calculateMetricAverage(metrics)` - Average review score
- `scoreGrade(score)` - Grade conversion (A+/A/B/C/D)
- `getHrmsSalaryReassessmentErrorMessage(error, fallback)` - Error handling

**Performance Metrics**:
- workQuality, communication, teamwork, leadership, punctuality
- taskCompletion, innovation, clientFeedback, reporting, skillDevelopment
- Score range: 0-100, converted to grades: A+ (90+), A (80-89), B (70-79), C (60-69), D (<60)

#### 6. Relieving Services
**File**: [src/services/hrmsRelievingApi.js](src/services/hrmsRelievingApi.js)

**Key Functions**:
- `fetchHrmsRelieving()` - GET relieving records
- `createHrmsRelieving(payload)` - POST relieving
- `normalizeHrmsRelieving(record)` - Normalize data
- `getHrmsRelievingErrorMessage(error, fallback)` - Error handling

**Relieving Checklist**: 
- Handover Documents
- Clear Pending Tasks
- Return Company Assets
- Exit Interview
- Final Settlement

### API Communication
**Base API File**: [src/services/api.js](src/services/api.js)
- Axios-based HTTP client
- All HRMS services use `import api from "./api"`
- Handles request/response interceptors

---

## 4. UTILITIES & HELPERS

### Date Formatting
**File**: [src/utils/dateFormat.js](src/utils/dateFormat.js)

**Key Functions**:
- `parseDateValue(value)` - Parse various date formats
- `formatDate(date)` - Format to ISO string
- `toDisplayDate(value)` - Format to DD/MM/YYYY for display
- `getDateParts(value)` - Extract day/month/year
- `isValidDate(value)` - Validate date

### General Formatters
**File**: [src/utils/formatters.js](src/utils/formatters.js)
- `money(value)` - Format as Indian currency (Rs.)
- `toNumber(value)` - Parse to number
- `toOptionalNumber(value)` - Parse to optional number

### Print/PDF Utilities
**File**: [src/utils/printUtils.js](src/utils/printUtils.js)
- `printSection({selector, title, subtitle, metaRows})` - Print HTML section
- PDF generation via window.print()
- Download file utilities

---

## 5. HRMS COMPONENTS

### Locations
Main components in: [src/components/](src/components/)
Sub-folders:
- `auth/` - Authentication components
- `common/` - Common/shared components (DateInput, Field, Input, Button, Panel, etc.)
- `inventory/` - Inventory-related components
- `layout/` - Layout components
- `notifications/` - Notification components
- `settings/` - Settings components

### Key Shared Components Used in HRMS
- **Panel**: Container for content sections
- **Field**: Form field wrapper with label
- **Input**: Text, select, number, date inputs
- **Button**: Action buttons
- **DateInput**: Date picker component
- **Notice**: Message/alert display
- **StatusBadge**: Status display with color coding

### HRMS-Specific Components in HrmsPlaceholder.jsx
- `EmployeeDocumentsSection` - Upload and manage employee documents
- `EmployeeProfilePage` - Display employee profile
- `EmployeeListPage` - Table view of employees
- `AttendanceCalendarPage` - Calendar with attendance marking
- `SalaryReassessmentPage` - Performance review and salary revision
- `PayslipPage` - Individual payslip generation
- `RelievingPage` - Exit process and relieving letter
- `HrmsReportsPage` - Report generation hub

---

## 6. KEY HOOKS IN HrmsPlaceholder.jsx

### Custom Hooks
- `useHrmsEmployees()` - Manage employees data and API calls
- `useHrmsAttendance()` - Manage attendance records
- `useHrmsReviews()` - Manage performance reviews
- `useHrmsSalaryReassessments()` - Manage salary reassessments
- `useHrmsSalaries()` - Manage payroll batches
- `useHrmsRelieving()` - Manage relieving records
- `useStoredList(key, fallback)` - LocalStorage persistence
- `useSettings()` - Get application settings

---

## 7. DATA STORAGE KEYS (LocalStorage)

**Location**: [src/pages/HrmsPlaceholder.jsx](src/pages/HrmsPlaceholder.jsx) (Line 44-52)

```javascript
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
```

---

## 8. EVENT SYSTEM

### Custom Events Emitted
Each service emits events to notify other components of data changes:

```javascript
window.dispatchEvent(new Event("hrms:employees:changed"));
window.dispatchEvent(new Event("hrms:attendance:changed"));
window.dispatchEvent(new Event("hrms:reviews:changed"));
window.dispatchEvent(new Event("hrms:salary-reassessments:changed"));
window.dispatchEvent(new Event("hrms:salaries:changed"));
window.dispatchEvent(new Event("hrms:relieving:changed"));
```

---

## 9. FILES TO MODIFY FOR MAJOR FEATURES

### Employee Management (Add/Edit/Delete/Documents)
**Files to Modify**:
1. [src/pages/HrmsPlaceholder.jsx](src/pages/HrmsPlaceholder.jsx#L2383) - Employee form logic (~2800 lines)
2. [src/services/hrmsEmployeesApi.js](src/services/hrmsEmployeesApi.js) - API calls
3. [backend/src/server.js](backend/src/server.js#L9978) - Backend endpoints
4. [src/utils/dateFormat.js](src/utils/dateFormat.js) - Date parsing utilities
5. [src/components/common/](src/components/common/) - Form components (Field, Input, Button)

**Database Changes**:
- Add fields to `[HRMS_DB].[dbo].[Employees]` table
- Document upload: Use `DocumentsJson` column (NVARCHAR(MAX))
- Store as JSON: `{ "pan": [{...}], "aadhaar": [{...}], ... }`

### Salary Processing with New Components
**Files to Modify**:
1. [src/pages/HrmsPlaceholder.jsx](src/pages/HrmsPlaceholder.jsx#L5534) - Payroll page (~1200 lines)
2. [src/services/hrmsSalariesApi.js](src/services/hrmsSalariesApi.js) - Salary API
3. [backend/src/server.js](backend/src/server.js#L9413) - Salary endpoints
4. [src/utils/formatters.js](src/utils/formatters.js) - Number formatting
5. Create new components: PayslipTemplate, SalaryBreakup, PayrollGrid

### Attendance Calendar
**Files to Modify**:
1. [src/pages/HrmsPlaceholder.jsx](src/pages/HrmsPlaceholder.jsx#L1800-2000) - Attendance UI section
2. [src/services/hrmsAttendanceApi.js](src/services/hrmsAttendanceApi.js) - Attendance API
3. [backend/src/server.js](backend/src/server.js#L8973) - Attendance endpoints
4. Create calendar component with date grid

### Review Module
**Files to Modify**:
1. [src/pages/HrmsPlaceholder.jsx](src/pages/HrmsPlaceholder.jsx#L1050-1300) - Review section
2. [src/services/hrmsReviewsApi.js](src/services/hrmsReviewsApi.js) - Review API
3. [backend/src/server.js](backend/src/server.js#L8006) - Review endpoints
4. Create metrics display and rating components

### Report Generation & PDF Export
**Files to Modify**:
1. [src/pages/HrmsPlaceholder.jsx](src/pages/HrmsPlaceholder.jsx#L6819) - Reports section (~200 lines)
2. [src/utils/printUtils.js](src/utils/printUtils.js) - PDF generation
3. [src/components/inventory/ReportsPage.jsx](src/components/inventory/ReportsPage.jsx) - Report template patterns
4. Create report generators for each report type

**PDF Methods Currently Used**:
- `window.print()` - Browser print dialog
- `window.open()` - Open print preview
- HTML generation and window.print()
- No external PDF library (pure CSS printing)

### Pagination Logic
**Files to Modify**:
1. [src/pages/HrmsPlaceholder.jsx](src/pages/HrmsPlaceholder.jsx#L233) - `buildPageNumbers()` function
2. Add pagination controls to list views
3. Implement page size selectors
4. Server-side pagination (optional backend work)

**Current Implementation**: 
- `buildPageNumbers(currentPage, totalPages)` - Shows pages within range
- Math-based pagination without external library

---

## 10. STORAGE PATTERNS

### LocalStorage Data Persistence
- All HRMS data persists in browser LocalStorage
- Data structure: JSON arrays stored under HRMS_STORAGE_KEYS
- Demo employee filtering removes test data automatically
- Cleared on successful API sync

### Demo Data Handling
**Location**: [src/pages/HrmsPlaceholder.jsx](src/pages/HrmsPlaceholder.jsx#L55-72)

Demo employees (automatically filtered):
- EMP001 - John Doe
- EMP002 - Jane Smith
- EMP003 - Michael Brown
- EMP004 - Emily Davis
- EMP005 - David Wilson

---

## 11. ERROR HANDLING

### Error Message Functions (All services)
```javascript
getHrmsEmployeeErrorMessage(error, fallback)
getHrmsAttendanceErrorMessage(error, fallback)
getHrmsReviewErrorMessage(error, fallback)
getHrmsSalaryErrorMessage(error, fallback)
getHrmsSalaryReassessmentErrorMessage(error, fallback)
getHrmsRelievingErrorMessage(error, fallback)
```

**Error Priority**:
1. `error.response.data.error`
2. `error.response.data.message`
3. `error.message`
4. Fallback message

---

## 12. NAVIGATION MENU

**File**: [src/components/layout/navigation.js](src/components/layout/navigation.js#L230-355)

**HRMS Menu Structure**:
```
HRMS
├── Employees
│   ├── New Employee
│   ├── Employee List
│   ├── Employee Profile
│   └── Edit Employee
├── Attendance
│   ├── Monthly Calendar
│   └── Attendance Report
├── Payroll
│   ├── Process Payroll
│   ├── Salary History
│   └── Payslips
├── Performance
│   ├── Reviews
│   └── Salary Reassessment
├── Exit
│   ├── Relieving Records
│   ├── Final Settlement
│   └── Letters
├── Search
└── Reports
```

---

## 13. DOCUMENT UPLOAD HANDLING

**Location**: [src/pages/HrmsPlaceholder.jsx](src/pages/HrmsPlaceholder.jsx#L850-870)

**Supported Document Types**:
- PAN (Single file)
- Aadhar (Single file)
- Offer Letter (Single file)
- Bank Details (Single file)
- UAN Number (Single file)
- ESI (Single file)
- Certificate (Single file)
- Additional Specialisation Certificates (Multiple files)

**Storage Method**:
- Documents stored in `DocumentsJson` field
- Format: `{ key: [{file_metadata}], ... }`
- Base64 encoding for file contents

---

## 14. FIELD VALIDATION

### Employee Form Validations (HrmsPlaceholder.jsx)
- Employee ID: Auto-generated with BE prefix
- Email: Basic format validation
- Phone: 10-digit validation
- PAN: Alphanumeric validation
- IFSC Code: Format validation
- Bank Account: Numeric validation
- Salary Fields: Number validation with 2 decimal places

---

## 15. SALARY CALCULATION FORMULAS

```javascript
// Gross Salary (Basic)
grossSalary = basicSalary

// Provident Fund (PF)
pfAmount = Math.round(grossSalary * 0.12)

// ESI (Employee State Insurance)
esiAmount = Math.round(grossSalary * 0.015)

// Total Deductions
totalDeductions = salaryDeduction + pfAmount + esiAmount

// Net Salary
netSalary = grossSalary - totalDeductions
```

---

## 16. REVIEW METRICS & GRADING

**Metric Fields**:
```javascript
workQuality, communication, teamwork, leadership, punctuality,
taskCompletion, innovation, clientFeedback, reporting, skillDevelopment
```

**Grading Scale**:
- **A+**: 90-100
- **A**: 80-89
- **B**: 70-79
- **C**: 60-69
- **D**: 0-59

---

## 17. TESTING CONSIDERATIONS

### Test Data
- Employees stored in LocalStorage can be cleared manually
- Demo employees auto-filtered
- Mock API in development (remove in production)
- All state managed in React hooks

### Browser DevTools
```javascript
// Access LocalStorage keys:
localStorage.getItem('hrms:employees')
localStorage.getItem('hrms:attendance')
localStorage.getItem('hrms:reviews')
// etc.

// Clear all HRMS data:
Object.values(HRMS_STORAGE_KEYS).forEach(key => localStorage.removeItem(key))
```

---

## SUMMARY TABLE: Files by Function

| Feature | Frontend File | Backend File | Service File |
|---------|---------------|--------------|--------------|
| **Employees** | HrmsPlaceholder.jsx:2000-2800 | server.js:9907-10184 | hrmsEmployeesApi.js |
| **Attendance** | HrmsPlaceholder.jsx:800-1500 | server.js:8973-8999 | hrmsAttendanceApi.js |
| **Reviews** | HrmsPlaceholder.jsx:1050-1300 | server.js:8006-8041 | hrmsReviewsApi.js |
| **Payroll** | HrmsPlaceholder.jsx:5534-6100 | server.js:9413-9504 | hrmsSalariesApi.js |
| **Salary Review** | HrmsPlaceholder.jsx:3700-4400 | server.js:8543-8792 | hrmsSalaryReassessmentsApi.js |
| **Relieving** | HrmsPlaceholder.jsx:1200-1400 | server.js:9765-9791 | hrmsRelievingApi.js |
| **Utilities** | dateFormat.js, formatters.js, printUtils.js | - | - |
| **Reports** | HrmsPlaceholder.jsx:6819-7000 | - | - |
