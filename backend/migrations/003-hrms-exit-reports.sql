-- HRMS Exit Employee and Reports Module
-- Date: 2026-06-15
-- Description: Add exit employee tracking and report enhancements

-- Exit employee table
IF OBJECT_ID('HRMS_DB.dbo.EmployeeExit', 'U') IS NULL
BEGIN
    CREATE TABLE HRMS_DB.dbo.EmployeeExit (
        ExitId INT IDENTITY(1,1) PRIMARY KEY,
        EmployeeId INT NOT NULL,
        ExitDate DATE,
        ExitReason VARCHAR(255),
        NoticePeriodDays INT,
        NoticeStartDate DATE,
        FinalSettlementStatus VARCHAR(20), -- 'Pending', 'Completed'
        FinalSettlementAmount DECIMAL(18,2),
        Documents NVARCHAR(MAX), -- JSON for exit documents
        Status VARCHAR(20) DEFAULT 'Pending', -- 'Pending', 'Processed', 'Completed'
        ProcessedBy VARCHAR(255),
        ProcessedDate DATETIME2,
        CreatedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_EmployeeExit_Employee FOREIGN KEY (EmployeeId) 
            REFERENCES HRMS_DB.dbo.Employees(EmployeeID)
    );
    CREATE INDEX IX_EmployeeExit_EmployeeId ON HRMS_DB.dbo.EmployeeExit(EmployeeId);
    CREATE INDEX IX_EmployeeExit_Status ON HRMS_DB.dbo.EmployeeExit(Status);
END;

-- Report configuration for dynamic report generation
IF OBJECT_ID('HRMS_DB.dbo.ReportConfigurations', 'U') IS NULL
BEGIN
    CREATE TABLE HRMS_DB.dbo.ReportConfigurations (
        ReportId INT IDENTITY(1,1) PRIMARY KEY,
        ReportName VARCHAR(255) NOT NULL,
        ReportType VARCHAR(50), -- 'Employee', 'Salary', 'Attendance', 'Exit'
        Columns NVARCHAR(MAX), -- JSON array of column definitions
        Filters NVARCHAR(MAX), -- JSON object of filter definitions
        DateFormat VARCHAR(20) DEFAULT 'MM/DD/YYYY',
        CurrencySymbol VARCHAR(10) DEFAULT 'INR',
        IncludeSummary BIT DEFAULT 1,
        IncludeSerialNumbers BIT DEFAULT 1,
        SerialNumberStart INT DEFAULT 1,
        CreatedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 DEFAULT SYSUTCDATETIME()
    );
END;

-- Employee report cache/export table
IF OBJECT_ID('HRMS_DB.dbo.ReportExports', 'U') IS NULL
BEGIN
    CREATE TABLE HRMS_DB.dbo.ReportExports (
        ExportId INT IDENTITY(1,1) PRIMARY KEY,
        ReportConfigId INT,
        ExportFormat VARCHAR(20), -- 'PDF', 'Excel', 'CSV'
        ExportStatus VARCHAR(20), -- 'Pending', 'Completed', 'Failed'
        FilePath VARCHAR(MAX),
        TotalRecords INT,
        SerialNumberStart INT,
        DateGenerated DATETIME2,
        CreatedAt DATETIME2 DEFAULT SYSUTCDATETIME()
    );
END;

PRINT 'Exit employee and reports migration completed successfully.';
