const Availment = require('../model/Availment');
const Account = require('../model/Account');
const Payment = require('../model/Payment');
const Collection = require('../model/Collection');
const mongoose = require('mongoose');

const serverErrorMessage = 'Internal server error, please try again';

module.exports.get_payments = async(req,res) => {
    try {
        const payments = await Payment.find().populate('account_id');
        if(payments.length < 1) {
            return res.status(200).json({ message: 'No payments recorded yet' });
        }

        res.status(200).json(payments);
    } catch(err) {
        console.log(err);
        res.status(500).json({ message: err.message || serverErrorMessage, error: err });
    }
}

module.exports.get_account_payments = async (req,res) => {

    const { account_number, payment_date } = req.query;

    if(!account_number || !payment_date) {
        return res.status(400).json({ message: 'Please input account number or payment date' });
    }
    
    try {
        // If account_number and payment_date was requested
        if(account_number && payment_date) {
            const account = await Account.findOne({ account_number, is_active: true, is_deleted: false });
            if(!account) return res.status(404).json({ message: `No account with account number of ${account_number} was found` });

            const payments = await Payment.find({ account_id: account._id, loan_date: { $gte: payment_date } });
            if(payments.length < 1) return res.status(404).json({ message: `No payments was made by ${account_number} with payment date of ${payment_date}` });
            return res.status(200).json(payments);
        }

        // If account_number is only requested
        if(account_number) {
            const account = await Account.findOne({ account_number, is_active: true, is_deleted: false });
            if(!account) return res.status(404).json({ message: `No account with account number of ${account_number} was found` });

            const payments = await Payment.find({ account_id: account._id });
            if(payments.length < 1) return res.status(404).json({ message: `No payments was made by ${account_number}` });
            return res.status(200).json(payments);
        }

        // If payment_date is only requested
        if(payment_date) {
            const payments = await Payment.find({ payment_date: { $gte: payment_date } });
            if(payments.length < 1) return res.status(200).json({ message: `No payments made starting ${payment_date}` })
            return res.status(200).json(payments);
        }

    } catch(err) {
        console.log(err);
        res.status(500).json({ message: err.message || serverErrorMessage, error: err });
    }
}

module.exports.collect_payment = async (req, res) => {
    const { employee_payments, employer_account } = req.body;

    if(!employee_payments?.length || !employer_account) {
        return res.status(400).json({ message: 'Please provide employee payments and employer account for processing.' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        for(const employee_payment of employee_payments) {
            const { account_number, payment_amount } = employee_payment;

            const employerAcct = await Account.findOne({ account_number: employer_account });
            if(!employerAcct) {
                throw new Error(`Account number: ${employer_account} not found`);
            }
            // Find active account
            const account = await Account.findOne({ account_number, is_active: true, is_deleted: false }).session(session);
            if(!account) {
                throw new Error(`Account number: ${account_number} not found`);
            }

            // Get availment
            const availment = await Availment.findOne({ account_id: account._id, is_paid: false }).session(session);
            if(!availment) {
                throw new Error(`No active availment found for account number: ${account_number}`);
            }

            if(payment_amount > availment.remaining_balance) {
                throw new Error(`Payment amount (${payment_amount}) exceeds availment balance (${availment.remaining_balance}) for account ${account_number}`);
            }

            // Check late payment fee
            const today = new Date();
            const isLate = availment.loan_due_date <= today;
            let totalPaymentAmount = payment_amount;
            let latePaymentFee = 0;

            if(isLate) {
                latePaymentFee = availment.remaining_balance * 0.05; // 5% Late Fee
                totalPaymentAmount += latePaymentFee;

                // Update Availment with new balance including late fee
                await Availment.findByIdAndUpdate(availment._id, {
                    $inc: { remaining_balance: latePaymentFee },
                    late_payment_fee: latePaymentFee
                }, { session });

                console.log(`Late fee of ${latePaymentFee} applied to account ${account_number}`);
            }

            // Process Payment
            await processPayment({ account, employerAcct, availment, totalPaymentAmount, payment_amount, latePaymentFee, session });
        }

        await session.commitTransaction();
        session.endSession();
        res.status(201).json({ message: 'Payments processed successfully' });
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error(err);
        res.status(500).json({ message: err.message || serverErrorMessage, error: err });
    }
};

async function processPayment({ account, employerAcct, availment, totalPaymentAmount, payment_amount, latePaymentFee, session }) {
    const paymentArray = await Payment.create([{ account_id: account._id, payment_amount }], { session });
    const payment = paymentArray[0];
    if(payment_amount >= totalPaymentAmount) {
        // Full payment, mark as paid
        await Availment.findByIdAndUpdate(availment._id, {
            is_paid: true,
            $inc: { remaining_balance: -totalPaymentAmount, late_payment_fee: -latePaymentFee },
            $push: { payment_id: payment._id }
        }, { session });

        // Return balance to employee Account
        await Account.findByIdAndUpdate(account._id, {
            availment_id: null,
            $inc: { account_balance: availment.availment_amount }
        }, { session });

        // Return balance to employer account
        await Account.findByIdAndUpdate(employerAcct._id,{
            $inc: { account_balance: availment.availment_amount }
        })

        await Collection.create([{ 
            late_payment_fee: latePaymentFee, 
            loan_due_date: availment.loan_due_date, 
            account_id: account._id, 
            availment_id: availment._id, 
            payment_id: payment._id 
        }], { session });
    } else {
        // Partial Payment: Pay late fee first, then reduce principal
        let remainingPayment = payment_amount;

        if(latePaymentFee > 0) {
            if(remainingPayment >= latePaymentFee) {
                // Fully pay the late fee
                remainingPayment -= latePaymentFee;
                await Availment.findByIdAndUpdate(availment._id, {
                    $inc: { late_payment_fee: -latePaymentFee },
                    is_paid: true
                }, { session });

                await Collection.create([{ 
                    late_payment_fee: latePaymentFee, 
                    loan_due_date: availment.loan_due_date, 
                    account_id: account._id, 
                    availment_id: availment._id, 
                    payment_id: payment._id,
                }], { session });
            } else {
                // Partial payment only covers part of the late fee
                await Availment.findByIdAndUpdate(availment._id, {
                    $inc: { late_payment_fee: -remainingPayment }
                }, { session });

                await Collection.create([{ 
                    late_payment_fee: remainingPayment, 
                    loan_due_date: availment.loan_due_date, 
                    account_id: account._id, 
                    availment_id: availment._id, 
                    payment_id: payment._id,
                    is_paid: false
                }], { session });

                remainingPayment = 0;
            }
        }

        if(remainingPayment > 0) {
            // Pay remaining principal balance
            await Availment.findByIdAndUpdate(availment._id, {
                $inc: { remaining_balance: -remainingPayment }
            }, { session });

            // Return balance to employer account
            await Account.findByIdAndUpdate(employerAcct._id,{
                $inc: { account_balance: payment_amount }
            })
        }

        await Account.findByIdAndUpdate(account._id, {
            $inc: { account_balance: payment_amount },
            availment_id: null
        }, { session });
    }

    console.log(`Payment of ${payment_amount} processed for account ${account.account_number}`);
}