// HRMS Employee Documents API Service
// Location: backend/services/hrmsDocumentService.js

import sql from 'mssql';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const UPLOAD_DIR = path.join(__dirname, '../../uploads/employee-documents');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Validate document upload
 */
export const validateDocumentUpload = (file, allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']) => {
  if (!file) {
    return { valid: false, error: 'File is required' };
  }

  const maxSizeMB = 10;
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `File size must be less than ${maxSizeMB}MB`
    };
  }

  if (!allowedTypes.includes(file.mimetype)) {
    return {
      valid: false,
      error: 'File type must be PDF, JPG, JPEG, or PNG'
    };
  }

  return { valid: true };
};

/**
 * Upload employee document
 */
export const uploadEmployeeDocument = async (pool, employeeId, documentType, file) => {
  const validation = validateDocumentUpload(file);
  if (!validation.valid) {
    const error = new Error(validation.error);
    error.statusCode = 400;
    throw error;
  }

  // Generate unique filename
  const timestamp = Date.now();
  const ext = path.extname(file.originalname);
  const fileName = `${employeeId}_${documentType}_${timestamp}${ext}`;
  const filePath = path.join(UPLOAD_DIR, fileName);

  try {
    // Save file to disk
    fs.writeFileSync(filePath, file.buffer);

    // Save metadata to database
    const result = await pool
      .request()
      .input('EmployeeId', sql.Int, employeeId)
      .input('DocumentType', sql.VarChar(50), documentType)
      .input('DocumentName', sql.VarChar(255), file.originalname)
      .input('FilePath', sql.VarChar(sql.MAX), filePath)
      .input('FileExtension', sql.VarChar(10), ext)
      .input('FileSize', sql.BigInt, file.size)
      .query(`
        INSERT INTO HRMS_DB.dbo.EmployeeDocuments 
          (EmployeeId, DocumentType, DocumentName, FilePath, FileExtension, FileSize)
        OUTPUT INSERTED.*
        VALUES (@EmployeeId, @DocumentType, @DocumentName, @FilePath, @FileExtension, @FileSize)
      `);

    return {
      documentId: result.recordset[0].DocumentId,
      documentType,
      documentName: file.originalname,
      uploadedAt: result.recordset[0].UploadedAt
    };
  } catch (error) {
    // Clean up file if database insert fails
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    throw error;
  }
};

/**
 * Get employee documents
 */
export const getEmployeeDocuments = async (pool, employeeId, documentType = null) => {
  let query = `
    SELECT 
      DocumentId,
      EmployeeId,
      DocumentType,
      DocumentName,
      FilePath,
      FileExtension,
      FileSize,
      UploadedAt,
      CreatedAt
    FROM HRMS_DB.dbo.EmployeeDocuments
    WHERE EmployeeId = @EmployeeId
  `;

  const request = pool.request().input('EmployeeId', sql.Int, employeeId);

  if (documentType) {
    query += ' AND DocumentType = @DocumentType';
    request.input('DocumentType', sql.VarChar(50), documentType);
  }

  query += ' ORDER BY CreatedAt DESC';

  const result = await request.query(query);
  return result.recordset || [];
};

/**
 * Delete employee document
 */
export const deleteEmployeeDocument = async (pool, documentId, employeeId) => {
  // Get document info first
  const result = await pool
    .request()
    .input('DocumentId', sql.Int, documentId)
    .input('EmployeeId', sql.Int, employeeId)
    .query(`
      SELECT FilePath FROM HRMS_DB.dbo.EmployeeDocuments
      WHERE DocumentId = @DocumentId AND EmployeeId = @EmployeeId
    `);

  if (!result.recordset || result.recordset.length === 0) {
    const error = new Error('Document not found');
    error.statusCode = 404;
    throw error;
  }

  const filePath = result.recordset[0].FilePath;

  // Delete from database
  await pool
    .request()
    .input('DocumentId', sql.Int, documentId)
    .query(`
      DELETE FROM HRMS_DB.dbo.EmployeeDocuments
      WHERE DocumentId = @DocumentId
    `);

  // Delete file from disk
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      console.error(`Failed to delete file: ${filePath}`, error);
      // Don't throw - document record already deleted
    }
  }

  return { success: true };
};

/**
 * Get document file for download
 */
export const getDocumentFile = async (pool, documentId, employeeId) => {
  const result = await pool
    .request()
    .input('DocumentId', sql.Int, documentId)
    .input('EmployeeId', sql.Int, employeeId)
    .query(`
      SELECT FilePath, DocumentName, FileExtension
      FROM HRMS_DB.dbo.EmployeeDocuments
      WHERE DocumentId = @DocumentId AND EmployeeId = @EmployeeId
    `);

  if (!result.recordset || result.recordset.length === 0) {
    const error = new Error('Document not found');
    error.statusCode = 404;
    throw error;
  }

  const document = result.recordset[0];
  if (!fs.existsSync(document.FilePath)) {
    const error = new Error('File not found on server');
    error.statusCode = 404;
    throw error;
  }

  return {
    filePath: document.FilePath,
    fileName: document.DocumentName,
    extension: document.FileExtension
  };
};

export default {
  validateDocumentUpload,
  uploadEmployeeDocument,
  getEmployeeDocuments,
  deleteEmployeeDocument,
  getDocumentFile
};
