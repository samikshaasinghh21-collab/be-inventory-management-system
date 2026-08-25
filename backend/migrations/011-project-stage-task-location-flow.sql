-- Enforce the Project -> Stage -> Milestone -> Task workflow and normalize
-- project departments and multi-location assignments without removing the
-- legacy JSON fields used by older clients.

IF COL_LENGTH('dbo.Projects','Department') IS NULL
  ALTER TABLE dbo.Projects ADD Department NVARCHAR(150) NULL;

EXEC(N'
UPDATE dbo.Projects
SET Department=NULLIF(JSON_VALUE(ManagementDataJson,''$.department''),N'''')
WHERE Department IS NULL AND ISJSON(ManagementDataJson)=1;
');

IF COL_LENGTH('dbo.ProjectMilestones','Stage') IS NULL
  ALTER TABLE dbo.ProjectMilestones ADD Stage NVARCHAR(20) NULL;

EXEC(N'
UPDATE dbo.ProjectMilestones
SET Stage=CASE
  WHEN Stage IN (N''Design'',N''Procure'',N''Implement'',N''Allocate'') THEN Stage
  WHEN LOWER(COALESCE(MilestoneName,N'''')) LIKE N''%design%'' THEN N''Design''
  WHEN LOWER(COALESCE(MilestoneName,N'''')) LIKE N''%procur%''
    OR LOWER(COALESCE(MilestoneName,N'''')) LIKE N''%material%'' THEN N''Procure''
  WHEN LOWER(COALESCE(MilestoneName,N'''')) LIKE N''%allocat%'' THEN N''Allocate''
  ELSE N''Implement''
END
WHERE Stage IS NULL OR Stage NOT IN (N''Design'',N''Procure'',N''Implement'',N''Allocate'');
');

IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE parent_object_id=OBJECT_ID('dbo.ProjectMilestones')
    AND name='CK_ProjectMilestones_Stage'
)
  EXEC(N'ALTER TABLE dbo.ProjectMilestones WITH CHECK ADD CONSTRAINT CK_ProjectMilestones_Stage
    CHECK(Stage IN (N''Design'',N''Procure'',N''Implement'',N''Allocate''))');

IF OBJECT_ID('dbo.ProjectLocations','U') IS NULL
BEGIN
  CREATE TABLE dbo.ProjectLocations(
    ProjectId INT NOT NULL,
    LocationId INT NOT NULL,
    IsPrimary BIT NOT NULL CONSTRAINT DF_ProjectLocations_IsPrimary DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ProjectLocations_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_ProjectLocations PRIMARY KEY(ProjectId,LocationId),
    CONSTRAINT FK_ProjectLocations_Project FOREIGN KEY(ProjectId) REFERENCES dbo.Projects(ProjectId),
    CONSTRAINT FK_ProjectLocations_Location FOREIGN KEY(LocationId) REFERENCES dbo.Locations(LocationId)
  );
  CREATE INDEX IX_ProjectLocations_Location ON dbo.ProjectLocations(LocationId,ProjectId);
END;

INSERT dbo.ProjectLocations(ProjectId,LocationId,IsPrimary)
SELECT l.ProjectId,l.LocationId,1
FROM dbo.Locations l
JOIN dbo.Projects p ON p.ProjectId=l.ProjectId
WHERE l.ProjectId IS NOT NULL
  AND NOT EXISTS(
    SELECT 1 FROM dbo.ProjectLocations pl
    WHERE pl.ProjectId=l.ProjectId AND pl.LocationId=l.LocationId
  );

EXEC(N'
INSERT dbo.ProjectLocations(ProjectId,LocationId,IsPrimary)
SELECT p.ProjectId,TRY_CONVERT(INT,JSON_VALUE(p.ManagementDataJson,''$.locationId'')),1
FROM dbo.Projects p
JOIN dbo.Locations l
  ON l.LocationId=TRY_CONVERT(INT,JSON_VALUE(p.ManagementDataJson,''$.locationId''))
WHERE ISJSON(p.ManagementDataJson)=1
  AND TRY_CONVERT(INT,JSON_VALUE(p.ManagementDataJson,''$.locationId'')) IS NOT NULL
  AND NOT EXISTS(
    SELECT 1 FROM dbo.ProjectLocations pl
    WHERE pl.ProjectId=p.ProjectId
      AND pl.LocationId=TRY_CONVERT(INT,JSON_VALUE(p.ManagementDataJson,''$.locationId''))
  );
');

-- A task now belongs to exactly one milestone. Preserve existing links by
-- retaining the oldest relation if historical data linked a task more than once.
;WITH DuplicateLinks AS (
  SELECT MilestoneId,TaskId,
    ROW_NUMBER() OVER(PARTITION BY TaskId ORDER BY MilestoneId) AS RowNumber
  FROM dbo.MilestoneTasks
)
DELETE FROM DuplicateLinks WHERE RowNumber>1;

-- Keep legacy unlinked tasks visible by placing them in an explicit migrated
-- milestone. New API writes require callers to choose a milestone.
EXEC(N'
INSERT dbo.ProjectMilestones(
  ProjectId,MilestoneNumber,MilestoneName,Description,Stage,Priority,
  IsCancelled,CreatedBy,UpdatedBy
)
SELECT t.ProjectId,CONCAT(N''MS-LEGACY-'',t.ProjectId),N''Migrated tasks'',
  N''Automatically created to preserve tasks that predate milestone-based workflow.'',
  N''Implement'',N''Medium'',0,MIN(t.CreatedBy),MIN(t.UpdatedBy)
FROM dbo.ProjectTasks t
WHERE NOT EXISTS(SELECT 1 FROM dbo.MilestoneTasks mt WHERE mt.TaskId=t.TaskId)
  AND NOT EXISTS(
    SELECT 1 FROM dbo.ProjectMilestones m
    WHERE m.ProjectId=t.ProjectId AND m.MilestoneNumber=CONCAT(N''MS-LEGACY-'',t.ProjectId)
  )
GROUP BY t.ProjectId;
');

INSERT dbo.MilestoneTasks(MilestoneId,TaskId)
SELECT m.MilestoneId,t.TaskId
FROM dbo.ProjectTasks t
JOIN dbo.ProjectMilestones m
  ON m.ProjectId=t.ProjectId AND m.MilestoneNumber=CONCAT(N'MS-LEGACY-',t.ProjectId)
WHERE NOT EXISTS(SELECT 1 FROM dbo.MilestoneTasks mt WHERE mt.TaskId=t.TaskId);

IF NOT EXISTS(
  SELECT 1 FROM sys.indexes
  WHERE object_id=OBJECT_ID('dbo.MilestoneTasks') AND name='UX_MilestoneTasks_Task'
)
  CREATE UNIQUE INDEX UX_MilestoneTasks_Task ON dbo.MilestoneTasks(TaskId);
