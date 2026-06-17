-- HRMS Employee Module Enhancements
-- Date: 2026-06-15
-- Description: Add PAN, Gross Salary, UAN, marital status, and document support

-- Add new employee fields
IF COL_LENGTH('HRMS_DB.dbo.Employees', 'PANNumber') IS NULL
BEGIN
    ALTER TABLE HRMS_DB.dbo.Employees ADD PANNumber VARCHAR(10) NULL;
    CREATE INDEX IX_Employees_PAN ON HRMS_DB.dbo.Employees(PANNumber);
END;

IF COL_LENGTH('HRMS_DB.dbo.Employees', 'GrossSalary') IS NULL
BEGIN
    ALTER TABLE HRMS_DB.dbo.Employees ADD GrossSalary DECIMAL(18,2) NULL;
END;

-- Replace ESI with Gross Salary (keep ESI for backward compatibility)
IF COL_LENGTH('HRMS_DB.dbo.Employees', 'BasicSalary') IS NULL
BEGIN
    ALTER TABLE HRMS_DB.dbo.Employees ADD BasicSalary DECIMAL(18,2) NULL;
END;

IF COL_LENGTH('HRMS_DB.dbo.Employees', 'TDS') IS NULL
BEGIN
    ALTER TABLE HRMS_DB.dbo.Employees ADD TDS DECIMAL(18,2) NULL;
END;

IF COL_LENGTH('HRMS_DB.dbo.Employees', 'ProfessionalTax') IS NULL
BEGIN
    ALTER TABLE HRMS_DB.dbo.Employees ADD ProfessionalTax DECIMAL(18,2) NULL;
END;

IF COL_LENGTH('HRMS_DB.dbo.Employees', 'UANNumber') IS NULL
BEGIN
    ALTER TABLE HRMS_DB.dbo.Employees ADD UANNumber VARCHAR(50) NULL;
END;

IF COL_LENGTH('HRMS_DB.dbo.Employees', 'Status') IS NULL
BEGIN
    ALTER TABLE HRMS_DB.dbo.Employees ADD Status VARCHAR(20) DEFAULT 'Active';
END;

-- Employee documents table for one-to-many support
IF OBJECT_ID('HRMS_DB.dbo.EmployeeDocuments', 'U') IS NULL
BEGIN
    CREATE TABLE HRMS_DB.dbo.EmployeeDocuments (
        DocumentId INT IDENTITY(1,1) PRIMARY KEY,
        EmployeeId INT NOT NULL,
        DocumentType VARCHAR(50) NOT NULL, -- 'PAN', 'BankDetails', 'Certificate', etc.
        DocumentName VARCHAR(255) NOT NULL,
        FilePath VARCHAR(MAX) NOT NULL,
        FileExtension VARCHAR(10),
        FileSize BIGINT,
        UploadedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
        CreatedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_EmployeeDocuments_Employee FOREIGN KEY (EmployeeId) 
            REFERENCES HRMS_DB.dbo.Employees(EmployeeID)
    );
    CREATE INDEX IX_EmployeeDocuments_EmployeeId ON HRMS_DB.dbo.EmployeeDocuments(EmployeeId);
    CREATE INDEX IX_EmployeeDocuments_Type ON HRMS_DB.dbo.EmployeeDocuments(DocumentType);
END;

-- Employee salary components table
IF OBJECT_ID('HRMS_DB.dbo.EmployeeSalaryComponents', 'U') IS NULL
BEGIN
    CREATE TABLE HRMS_DB.dbo.EmployeeSalaryComponents (
        ComponentId INT IDENTITY(1,1) PRIMARY KEY,
        EmployeeId INT NOT NULL,
        Year INT,
        Month INT,
        BasicSalary DECIMAL(18,2),
        HRA DECIMAL(18,2),
        TravelAllowance DECIMAL(18,2),
        MedicalAllowance DECIMAL(18,2),
        OtherAllowances DECIMAL(18,2),
        GrossSalary DECIMAL(18,2),
        TDS DECIMAL(18,2),
        ProfessionalTax DECIMAL(18,2),
        ProvidentFund DECIMAL(18,2),
        TotalDeductions DECIMAL(18,2),
        NetSalary DECIMAL(18,2),
        CreatedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_SalaryComponents_Employee FOREIGN KEY (EmployeeId) 
            REFERENCES HRMS_DB.dbo.Employees(EmployeeID)
    );
    CREATE INDEX IX_SalaryComponents_EmployeeId ON HRMS_DB.dbo.EmployeeSalaryComponents(EmployeeId);
    CREATE INDEX IX_SalaryComponents_YearMonth ON HRMS_DB.dbo.EmployeeSalaryComponents(Year, Month);
END;

-- Employee review history table
IF OBJECT_ID('HRMS_DB.dbo.EmployeeReviews', 'U') IS NULL
BEGIN
    CREATE TABLE HRMS_DB.dbo.EmployeeReviews (
        ReviewId INT IDENTITY(1,1) PRIMARY KEY,
        EmployeeId INT NOT NULL,
        ReviewFromDate DATE,
        ReviewToDate DATE,
        PreviousSalary DECIMAL(18,2),
        NewSalary DECIMAL(18,2),
        SalaryIncrease DECIMAL(18,2),
        IncrementPercentage DECIMAL(5,2),
        ReviewerName VARCHAR(255),
        ReviewNotes NVARCHAR(MAX),
        Status VARCHAR(20), -- 'Draft', 'Submitted', 'Approved'
        ApprovedBy VARCHAR(255),
        ApprovedDate DATETIME2,
        CreatedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_EmployeeReviews_Employee FOREIGN KEY (EmployeeId) 
            REFERENCES HRMS_DB.dbo.Employees(EmployeeID)
    );
    CREATE INDEX IX_EmployeeReviews_EmployeeId ON HRMS_DB.dbo.EmployeeReviews(EmployeeId);
    CREATE INDEX IX_EmployeeReviews_DateRange ON HRMS_DB.dbo.EmployeeReviews(ReviewFromDate, ReviewToDate);
END;

-- Employee relation field (for family/dependents)
IF COL_LENGTH('HRMS_DB.dbo.Employees', 'Relation') IS NULL
BEGIN
    ALTER TABLE HRMS_DB.dbo.Employees ADD Relation VARCHAR(100) NULL; -- 'Self', 'Spouse', 'Child', etc.
END;

-- Add pagination support field
IF COL_LENGTH('HRMS_DB.dbo.Employees', 'RowVersion') IS NULL
BEGIN
    ALTER TABLE HRMS_DB.dbo.Employees ADD RowVersion ROWVERSION;
END;

PRINT 'Employee enhancements migration completed successfully.';
