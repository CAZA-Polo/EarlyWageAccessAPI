const Account = require('../model/Account');
const AccountCounter = require('../model/AccountCounter');
const mongoose = require('mongoose');

const serverErrorMessage = 'Internal server error, please try again';

const validateId = (id) => {
    let message = ''
    if(!mongoose.Types.ObjectId.isValid(id)) {
        message = `Invalid ID format for mongodb: ${id}`
    }

    return message;
}


module.exports.get_accounts = async(req,res) => {
    try {
        const accounts = await Account.find({ is_deleted: false }).populate('customer_id availment_id');
        if(accounts.length < 1) return res.status(200).json({ message: 'There are no account records yet' });
        res.status(200).json(accounts);
    } catch(err) {
        console.log(err);
        res.status(500).json({ message: err.message || serverErrorMessage, error: err })
    }
}

module.exports.get_account = async(req,res) => {
    // Changes
    // Change id from mongodb to account number in searching
    
    const { id } = req.params; // might also be account number for searching

    const checkIdMessage = validateId(id);

    // if(checkIdMessage) return res.status(400).json({ message: checkIdMessage });

    try {
        const account = await Account.findOne({ account_number: id, is_deleted: false, is_active: true});
        if(!account) return res.status(404).json({ message: `Account with ID ${id} does not exist` });
        res.status(200).json(account);
    } catch(err) {
        console.log(err);
        res.status(500).json({ message: err.message || serverErrorMessage, error: err })
    }
}

module.exports.add_account = async(req,res) => {
    
    const preAcctName = 'CAZA'

    try {
        // Increment the counter for account numbers
        const counter = await AccountCounter.findById('account');
        let accountNumber = `${preAcctName}${new Date().getFullYear()}${1000}`; // Year plus 1000 sequence number

        if(!counter) {
            await AccountCounter.create({ _id: 'account', sequence_value: accountNumber });
        } else {
            const newCounter = await AccountCounter.findByIdAndUpdate(
                { _id: 'account' }, // Identifier for the account counter
                { $inc: { sequence_value: 1 } }, // Increment the sequence_value by 1
                { new: true, upsert: true } // Create if not exists, return the updated document
            );
            accountNumber = newCounter.sequence_value;
        }

        // Assign the new unique account_number
        const newAccountData = {
            ...req.body,
            account_number: accountNumber
        };

        const account = await Account.create(newAccountData);
        res.status(201).json({ message: `Account ${accountNumber} has been created successfully`, account, account_id: account._id });
    } catch(err) {
        console.log(err);
        res.status(500).json({ message: err.message || serverErrorMessage, error: err })
    }
}

module.exports.delete_account = async (req,res) => {

    const { id } = req.params;

    try {
        const account = await Account.findOneAndUpdate({ _id: id, is_deleted: true, is_active: false});
        res.status(200).json({ message: `${account.account_number} has been deleted` });
    } catch(err) {
        console.log(err);
        res.status(500).json({ message: err.message || serverErrorMessage, error: err })
    }
}

module.exports.update_account = async (req,res) => {
    
    const { id } = req.params;

    try {
        const account = await Account.findByIdAndUpdate(id, req.body).populate('customer_id');
        res.status(201).json({ message: `${account.account_number} has been updated successfully` });
    } catch(err) {
        console.log(err);
        res.status(500).json({ message: err.message || serverErrorMessage, error: err })
    }
}