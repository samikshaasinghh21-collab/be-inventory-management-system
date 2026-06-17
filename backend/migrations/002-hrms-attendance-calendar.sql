-- HRMS Attendance and Calendar Fixes
-- Date: 2026-06-15
-- Description: Add attendance calendar and tracking support

IF OBJECT_ID('HRMS_DB.dbo.AttendanceRecords', 'U') IS NULL
BEGIN
    CREATE TABLE HRMS_DB.dbo.AttendanceRecords (
        AttendanceId INT IDENTITY(1,1) PRIMARY KEY,
        EmployeeId INT NOT NULL,
        AttendanceDate DATE NOT NULL,
        DayOfWeek INT, -- 0=Sunday, 1=Monday, ..., 6=Saturday
        Status VARCHAR(20), -- 'Present', 'Absent', 'Leave', 'Holiday'
        LeaveType VARCHAR(50),
        WorkedHours DECIMAL(5,2),
        Notes NVARCHAR(MAX),
        CreatedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Attendance_Employee FOREIGN KEY (EmployeeId) 
            REFERENCES HRMS_DB.dbo.Employees(EmployeeID),
        CONSTRAINT UQ_AttendanceDate UNIQUE(EmployeeId, AttendanceDate)
    );
    CREATE INDEX IX_Attendance_EmployeeDate ON HRMS_DB.dbo.AttendanceRecords(EmployeeId, AttendanceDate);
END;

-- Calendar configuration table
IF OBJECT_ID('HRMS_DB.dbo.CalendarConfiguration', 'U') IS NULL
BEGIN
    CREATE TABLE HRMS_DB.dbo.CalendarConfiguration (
        CalendarId INT IDENTITY(1,1) PRIMARY KEY,
        Year INT NOT NULL,
        Month INT NOT NULL,
        DayOfWeekCorrection INT DEFAULT 0, -- To handle timezone/day calculation corrections
        TimezoneOffset VARCHAR(10) DEFAULT 'IST',
        CreatedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 DEFAULT SYSUTCDATETIME()
    );
END;

-- Holiday calendar
IF OBJECT_ID('HRMS_DB.dbo.Holidays', 'U') IS NULL
BEGIN
    CREATE TABLE HRMS_DB.dbo.Holidays (
        HolidayId INT IDENTITY(1,1) PRIMARY KEY,
        HolidayDate DATE NOT NULL,
        HolidayName VARCHAR(255) NOT NULL,
        DayOfWeek INT,
        IsNationalHoliday BIT DEFAULT 1,
        CreatedAt DATETIME2 DEFAULT SYSUTCDATETIME()
    );
    CREATE UNIQUE INDEX IX_Holidays_Date ON HRMS_DB.dbo.Holidays(HolidayDate);
END;

PRINT 'Attendance and calendar migration completed successfully.';
