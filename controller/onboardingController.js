const Customer = require('../model/Customer');
const Account = require('../model/Account');
const AccountCounter = require('../model/AccountCounter');

const serverErrorMessage = 'Internal server error, please try again';

module.exports.onboard_employer = async(req,res) => {
    const { employer_id, account_balance, company_name } = req.body;
    
    const preAcctName = 'CAZA';
    const is_employer = true;

    try {
        
        // Look for this customer employer before searching
        const customer = await Customer.findOne({ customer_reference: employer_id });
        if(!customer) return res.status(404).json({ message: 'Employer ID is not existing' });

        // Tag customer as employer
        await Customer.findByIdAndUpdate(employer_id, { is_employer: is_employer, company_name });
        console.log(`Customer ${employer_id} has been tagged as employer`);

        // Create an Account for the employer customer
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
            customer_id: employer_id,
            account_number: accountNumber,
            account_balance: account_balance,
        };

        await Account.create(newAccountData);
        console.log(`Account Number ${accountNumber} has been created for customer ${employer_id}`)
        res.status(201).json({ message: `Account Number ${accountNumber} has been created for customer ${employer_id}` })
    } catch(err) {
        console.log(err);
        res.status(500).json({ message: err.message || serverErrorMessage, error: err })
    }
}   

module.exports.onboard_employees = async(req,res) => {
    const { employee_ids,employer_id } = req.body;

    // Note: Upon onboarding, deduct the account_balance of employer depending on the account balance passed to employee accounts

    // Sample Request
    // const employee_ids = [
    //     {
    //         customer_id: 12345,
    //         salary_days: [15,30],
    //         account_balance: 15000
    //     }
    // ]

    try {
        for(const employee of employee_ids) {
            // Update Customer Employer Record
            const employer = await Customer.findOneAndUpdate(
                { _id: employer_id, is_employer: true},
                { $push: { employees: employee.customer_id } }, // Adds new employee_ids, prevents duplicates
                { new: true } // Returns the updated document
            );

            if (!employer) {
                return res.status(404).json({ message: "Employer customer record not found, please onboard employer first" });
            }

            // Create Account for each customer created
            // Increment the counter for account numbers
            const counter = await AccountCounter.findById('account');
            let accountNumber = `${new Date().getFullYear()}${1000}`; // Year plus 1000 sequence number

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
                customer_id: employee.customer_id,
                account_number: accountNumber,
                salary_days: employee.salary_days,
                account_balance: employee.account_balance,
            };

            const account = await Account.create(newAccountData);
            console.log(`Account Number ${accountNumber} has been created for customer ${employee.id}`);

            // Update the employer account balance by deducting the employee.account_balance to the account balance of employer
            await Account.findOneAndUpdate(
                { customer_id: employer_id }, // Find the employer account
                { $inc: { account_balance: -employee.account_balance } }, // Deduct employee's balance
                { new: true } // Return the updated document
            );            
            console.log('Employer account was deducted by ' + employee.account_balance);
        }

        // Might add new table for recording of employers and employees
        res.status(201).json({ message: `${employer_id} has been added a new employee and accounts has been created` });
    } catch(err) {
        console.log(err);
        res.status(500).json({ message: err.message || serverErrorMessage, error: err })
    }
}