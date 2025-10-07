const formidable = require('express-formidable');
const fs = require('fs'); // Import the file system module
const path = require('path'); // Import path module for cross-platform paths

// Define the temporary upload directory
const uploadDir = path.join(__dirname, '../tmp'); // Use a relative path to a 'tmp' folder in your project or a known accessible path

// Ensure the upload directory exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure formidable for file uploads
const upload = formidable({
    encoding: 'utf-8',
    uploadDir: uploadDir, // Use the ensured directory
    multiples: false, // Single file upload
    keepExtensions: true,
    maxFileSize: 5 * 1024 * 1024, // 5MB limit
    filter: function ({ name, originalFilename, mimetype }) {
        // Only allow image files
        return mimetype && mimetype.startsWith('image/');
    }
});

module.exports = upload;
