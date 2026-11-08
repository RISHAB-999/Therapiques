import userModel from '../models/userModel.js'

/**
 * Atomic Therapique coin ledger operations.
 * Using $inc with a guarded filter removes the read-modify-write races that allowed
 * double spending / lost updates when several requests touched a wallet concurrently.
 */
const toWholeCoins = (amount) => Math.round(Number(amount))

const isValidAmount = (amount) => Number.isFinite(amount) && amount > 0 && amount <= 10_000_000

/** Adds coins. Returns the updated user (therapiqueCoins only) or null. */
export const creditCoins = async (userId, amount, transaction) => {
    const coins = toWholeCoins(amount)
    if (!isValidAmount(coins)) return null
    return userModel.findOneAndUpdate(
        { _id: userId },
        { $inc: { therapiqueCoins: coins }, $push: { coinsTransactions: { type: 'earn', amount: coins, date: new Date(), ...transaction } } },
        { new: true, projection: { therapiqueCoins: 1, email: 1, name: 1 } }
    )
}

/** Deducts coins only if the balance is sufficient. Returns the updated user or null when insufficient. */
export const debitCoins = async (userId, amount, transaction) => {
    const coins = toWholeCoins(amount)
    if (!isValidAmount(coins)) return null
    return userModel.findOneAndUpdate(
        { _id: userId, therapiqueCoins: { $gte: coins } },
        { $inc: { therapiqueCoins: -coins }, $push: { coinsTransactions: { type: 'spend', amount: coins, date: new Date(), ...transaction } } },
        { new: true, projection: { therapiqueCoins: 1, email: 1, name: 1 } }
    )
}

/**
 * Credits purchased coins exactly once per Razorpay order (idempotent).
 * Returns { user, alreadyCredited }.
 */
export const creditPurchasedCoinsOnce = async (userId, amount, orderId, transaction) => {
    const coins = toWholeCoins(amount)
    if (!isValidAmount(coins) || typeof orderId !== 'string') return { user: null, alreadyCredited: false }
    const user = await userModel.findOneAndUpdate(
        { _id: userId, 'coinsTransactions.orderId': { $ne: orderId } },
        { $inc: { therapiqueCoins: coins }, $push: { coinsTransactions: { type: 'purchase', amount: coins, orderId, date: new Date(), ...transaction } } },
        { new: true, projection: { therapiqueCoins: 1 } }
    )
    if (user) return { user, alreadyCredited: false }
    const existing = await userModel.findById(userId).select('therapiqueCoins').lean()
    return { user: existing, alreadyCredited: Boolean(existing) }
}
