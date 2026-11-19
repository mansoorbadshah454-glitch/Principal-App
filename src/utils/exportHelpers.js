import * as XLSX from 'xlsx';
import { zipSync, strToU8 } from 'fflate';

/**
 * Trigger browser file download from Blob
 */
export const triggerDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * Format any date or Firestore Timestamp safely to YYYY-MM-DD
 */
export const formatSafeDate = (val) => {
    if (!val) return '';
    try {
        if (typeof val === 'object' && val.toDate) {
            return val.toDate().toISOString().split('T')[0];
        }
        if (typeof val === 'object' && val.seconds) {
            return new Date(val.seconds * 1000).toISOString().split('T')[0];
        }
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
            return d.toISOString().split('T')[0];
        }
    } catch {
        // ignore
    }
    return String(val);
};

/**
 * Convert an array of objects to UTF-8 CSV string with BOM for Excel compatibility
 */
export const arrayToCSV = (rows = [], columns = null) => {
    if (!rows || rows.length === 0) return '\uFEFF';

    // Determine columns if not explicitly provided
    const cols = columns || Object.keys(rows[0]).map(key => ({ key, label: key }));

    const escapeCell = (val) => {
        if (val === null || val === undefined) return '""';
        let str = String(val);
        if (typeof val === 'object') {
            try {
                str = JSON.stringify(val);
            } catch {
                str = '';
            }
        }
        // If it contains quotes, commas or newlines, quote it and escape internal quotes
        if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return `"${str}"`;
    };

    const headerLine = cols.map(c => escapeCell(c.label || c.key)).join(',');
    const dataLines = rows.map(row => {
        return cols.map(c => escapeCell(row[c.key])).join(',');
    });

    // \uFEFF ensures UTF-8 BOM so Urdu, Arabic, and accents display without garbling in MS Excel
    return '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
};

/**
 * Download a single CSV file directly
 */
export const downloadSingleCSV = (filename, rows, columns) => {
    const csvContent = arrayToCSV(rows, columns);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
};

/**
 * Export multiple sheets into a single, beautifully organized Excel (.xlsx) file
 * @param {string} fileName - Output filename e.g. "GreenWood_School_Data.xlsx"
 * @param {Object} sheetsMap - e.g. { "Students": [ { ... } ], "Teachers": [ { ... } ] }
 */
export const exportMultiSheetExcel = (fileName, sheetsMap = {}) => {
    const wb = XLSX.utils.book_new();

    Object.entries(sheetsMap).forEach(([sheetName, data]) => {
        const safeSheetName = sheetName.substring(0, 31).replace(/[:\\/?*[\]]/g, '_');
        const rows = Array.isArray(data) && data.length > 0 ? data : [{ Info: 'No records found' }];
        const ws = XLSX.utils.json_to_sheet(rows);

        // Auto calculate column widths for clean readability
        try {
            const colKeys = Object.keys(rows[0] || {});
            const colWidths = colKeys.map(key => {
                let maxLen = key.length;
                rows.slice(0, 50).forEach(r => {
                    const valStr = r[key] !== null && r[key] !== undefined ? String(r[key]) : '';
                    if (valStr.length > maxLen) maxLen = valStr.length;
                });
                return { wch: Math.min(Math.max(maxLen + 3, 12), 40) };
            });
            ws['!cols'] = colWidths;
        } catch {
            // column width fallback
        }

        XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
    });

    XLSX.writeFile(wb, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
};

/**
 * Export all data files bundled inside a single .ZIP archive
 * @param {string} zipFileName - e.g. "School_Full_Backup.zip"
 * @param {Object} filesMap - e.g. { "Students.csv": csvStr, "Teachers.csv": csvStr, "Database.json": jsonStr }
 */
export const exportZipArchive = (zipFileName, filesMap = {}) => {
    const zipEntries = {};

    Object.entries(filesMap).forEach(([filename, content]) => {
        if (typeof content === 'string') {
            zipEntries[filename] = strToU8(content);
        } else if (content instanceof Uint8Array) {
            zipEntries[filename] = content;
        }
    });

    const zipped = zipSync(zipEntries, { level: 6 });
    const blob = new Blob([zipped], { type: 'application/zip' });
    triggerDownload(blob, zipFileName.endsWith('.zip') ? zipFileName : `${zipFileName}.zip`);
};

/**
 * Download raw formatted JSON
 */
export const downloadJSON = (filename, data) => {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    triggerDownload(blob, filename.endsWith('.json') ? filename : `${filename}.json`);
};
