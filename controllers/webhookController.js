
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const User = require('../models/User'); // Assuming User might be needed for future enhancements, though not directly used in this snippet

const zapupiWebhook = async (req, res) => {
    try {
        const { order_id, status, amount, txn_id, custumer_mobile } = req.body;

        console.log("📩 ZapUPI Webhook Received:", req.body);

        // Find the pending transaction by order_id
        const transaction = await Transaction.findOne({ zapupiOrderId: order_id, status: 'pending' });

        if (!transaction) {
            console.log("⚠️ Transaction not found or already processed for order_id:", order_id);
            // Respond with 200 OK even if not found to prevent Zapupi from retrying unnecessarily
            return res.status(200).json({ success: true, message: 'Transaction not found or already processed' });
        }

        // Update based on payment status
        if (status === 'Success') {
            const wallet = await Wallet.findOne({ userId: transaction.userId });
            if (wallet) {
                wallet.depositBalance += transaction.amount;
                wallet.totalBalance += transaction.amount;
                await wallet.save();
            } else {
                console.error(`Wallet not found for user ${transaction.userId} during successful ZapUPI webhook.`);
            }

            transaction.status = 'success';
            transaction.description = `Deposit ₹${amount} successful via ZapUPI webhook`;
            transaction.zapupiTxnId = txn_id;
            await transaction.save();

            console.log("✅ Deposit Successful via Webhook:", transaction._id);
        }
        else if (status === 'Failed') {
            transaction.status = 'failed';
            transaction.description = `Deposit ₹${amount} failed via ZapUPI webhook`;
            await transaction.save();

            console.log("❌ Deposit Failed via Webhook:", transaction._id);
        } else {
            // Handle other statuses if necessary, or just log them
            console.log(`ℹ️ ZapUPI Webhook received status '${status}' for order_id: ${order_id}. Transaction remains pending.`);
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error("ZapUPI Webhook error:", error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports = { zapupiWebhook };