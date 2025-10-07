const axios = require('axios');
const FormData = require('form-data');

const sendOtp = async (phone, otp) => {
    try {
        const form = new FormData();
        form.append('otp', otp);
        form.append('type', 'SMS');
        form.append('numberOrMail', phone);

        const res = await axios.post(
            process.env.OTP_API_URL,
            form,
            {
                headers: {
                    ...form.getHeaders(),
                    'Api-Key': process.env.OTP_API_KEY,
                    'Api-Salt': process.env.OTP_API_SALT
                }
            }
        );

        return res.data; // { message, status }
    } catch (err) {
        console.error('OTP sending error:', err);
        return { message: 'OTP sending failed', status: false };
    }
};

const generateOtp = () => Math.floor(100000 + Math.random() * 900000); // 6-digit OTP

module.exports = {
    sendOtp,
    generateOtp
};