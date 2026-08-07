IF COL_LENGTH('dbo.ReallocateInventory', 'VehicleNumber') IS NULL
BEGIN
  ALTER TABLE dbo.ReallocateInventory
    ADD VehicleNumber NVARCHAR(50) NULL;
END;

IF COL_LENGTH('dbo.ReallocateInventory', 'EWayBillNumber') IS NULL
BEGIN
  ALTER TABLE dbo.ReallocateInventory
    ADD EWayBillNumber NVARCHAR(100) NULL;
END;
