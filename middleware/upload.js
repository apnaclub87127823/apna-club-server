// const formidable = require('express-formidable');
// const fs = require('fs'); // Import the file system module
// const path = require('path'); // Import path module for cross-platform paths

// // Define the temporary upload directory
// // Use a relative path to a 'tmp' folder in your project for local development
// const uploadDir = path.join(__dirname, '../tmp');

// // Ensure the upload directory exists
// if (!fs.existsSync(uploadDir)) {
//     fs.mkdirSync(uploadDir, { recursive: true });
// }

// // Configure formidable for file uploads
// const upload = formidable({
//     encoding: 'utf-8',
//     uploadDir: uploadDir, // Use the ensured directory
//     multiples: false, // Single file upload
//     keepExtensions: true,
//     maxFileSize: 5 * 1024 * 1024, // 5MB limit
//     filter: function ({ name, originalFilename, mimetype }) {
//         // Only allow image files
//         return mimetype && mimetype.startsWith('image/');
//     }
// });

// module.exports = upload;


// vercel only
const formidable = require('express-formidable');
const fs = require('fs'); // Import the file system module
const path = require('path'); // Import path module for cross-platform paths

// Define the temporary upload directory to use the Vercel-provided writable /tmp directory
const uploadDir = '/tmp';

// No need to ensure the directory exists with fs.mkdirSync, as /tmp is always available in serverless environments.

// Configure formidable for file uploads
const upload = formidable({
    encoding: 'utf-8',
    uploadDir: uploadDir, // Use the writable /tmp directory
    multiples: false, // Single file upload
    keepExtensions: true,
    maxFileSize: 5 * 1024 * 1024, // 5MB limit
    filter: function ({ name, originalFilename, mimetype }) {
        // Only allow image files
        return mimetype && mimetype.startsWith('image/');
    }
});

module.exports = upload;

