const Availment = require('../model/Availment');
const Account = require('../model/Account');

const serverErrorMessage = 'Internal server error, please try again';

const calculateAvailmentFee = (amount) => {
    let chargeFee = 0;
    let stopAmountCheck = true;
    let availmentAmount = amount;

    while(stopAmountCheck) {
        if(availmentAmount <= 5000) {
            chargeFee += 100;
            stopAmountCheck = false;
        } else {
            chargeFee += 50;
            availmentAmount -= 5000
        }
    }

    return chargeFee;
}

const setLoanDueDate = (salary_days) => {
    const today = new Date().getDate();
    const dueDate = new Date();

    console.log('Today: ' + today);

    let found = false;

    for(const salary_day of salary_days) {
        if(today <= salary_day) {
            dueDate.setMonth(dueDate.getMonth() + 1, salary_day); // Set due date to next month
            found = true;
            break;
        }
    }

    // If today is greater than all salary days, set the due date to the last salary day
    if(!found) {
        dueDate.setMonth(dueDate.getMonth() + 1, salary_days[salary_days.length - 1]);
    }

    return dueDate;
}

module.exports.get_availments = async (req,res) => {

    try {
        const availments = await Availment.find({ is_deleted: false }).populate('account_id');
        if(availments.length < 1) {
            return res.status(200).json({ message: 'No records for availments yet' });
        }

        res.status(200).json(availments);
    } catch(err) {
        console.log(err);
        res.status(500).json({ message: err.message || serverErrorMessage, error: err })
    }
}

module.exports.get_availment = async(req,res) => {

    const { id } = req.params;

    if(!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: `Invalid ID format for mongodb: ${id}` });
    }

    try {   
        const availment = await Availment.findOne({ _id: id, is_deleted: false }).populate('account_id');
        if(!availment) return res.status(404).json({ message: `Availment with ID ${id} does not exist` });
        res.status(200).json(availment);
    } catch(err) {
        console.log(err);
        res.status(500).json({ message: err.message || serverErrorMessage, error: err })
    }
}

module.exports.avail_cash_advance = async(req,res) => {

    const { account_number, availment_amount } = req.body;

    if (!availment_amount || isNaN(availment_amount)) {
        return res.status(400).json({ message: "Invalid availment amount" });
    }

    try {
        const availmentFee = calculateAvailmentFee(availment_amount);
        const account = await Account.findOne({ account_number, is_deleted: false, is_active: true });
        if(!account) {
            return res.status(404).json({ message: 'Account not found' });
        }

        let availment = await Availment.findOne({ account_id: account._id });
        console.log('Availment: ', availment);

        if(!availment || availment.is_paid) {
            // If no availment exists or the last one is paid, create a new availment
            const dueDate = setLoanDueDate(account.salary_days); // call function for creating loan due date
            console.log(dueDate, 'We are new', availment_amount)
            availment = await Availment.create({
                account_id: account._id,
                availment_amount,
                loan_due_date: dueDate,
                remaining_balance: availment_amount
            });

            // Update Account record and write availment id
            await Account.findByIdAndUpdate(account._id, { availment_id: availment._id, $inc: { account_balance: -availment_amount } }, { new: true });
            console.log('Availment created successfully')
        } else {
            // If an active availment exists, update it by adding the new amount
            // If greater than due date, do not allow availments
            console.log('We are updating availment record');
            await Availment.findByIdAndUpdate(
                availment._id,
                { $inc: { availment_amount: availment_amount }, remaining_balance: availment.availment_amount + availment_amount }
            );
            await Account.findByIdAndUpdate(account._id, { availment_id: availment._id, $inc: { account_balance: -availment_amount } }, { new: true });
            console.log('Availment updated successfully')
        }

        res.status(201).json({ 
            message: 'Availment successful', 
            availment_fee: availmentFee,
            account_number,
        });
    } catch(err) {
        console.log(err);
        res.status(500).json({ message: err.message || serverErrorMessage, error: err })
    }
}

