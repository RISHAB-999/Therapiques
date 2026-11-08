import bookModel from '../models/bookModel.js'
import { isObjectId } from './security.js'

/**
 * Server-side book order pricing. The client's `amount` and item prices are never trusted:
 * prices come from the database using the same format rules as the storefront.
 */
export const DELIVERY_CHARGES = 100
export const TAX_PERCENT = 2
const DEFAULT_FORMAT = 'Standard Paperback'
const MAX_LINE_ITEMS = 50
const MAX_QUANTITY = 20

// Mirrors getBookPriceWithFormat() in frontend/src/context/ShopContext.jsx
export const getFormatPrice = (basePrice, format = DEFAULT_FORMAT) => {
    const base = Number(basePrice) || 0
    if (format === 'Deluxe Hardcover' || format === 'Hardcover') return base + 400
    if (format === 'Pocket / Travel Edition') return Math.max(100, base - 200)
    if (format === 'E-Book') return Math.max(100, base - 300)
    if (format === 'Audiobook') return Math.max(100, base - 100)
    return base
}

/** Order total exactly as shown in the cart: subtotal + delivery + 2% tax. */
export const computeOrderTotal = (subtotal) => subtotal + DELIVERY_CHARGES + (subtotal * TAX_PERCENT) / 100

const formatFromName = (name) => {
    const match = typeof name === 'string' ? name.match(/\(([^()]+)\)\s*$/) : null
    return match ? match[1].trim() : DEFAULT_FORMAT
}

const pricingError = (message) => Object.assign(new Error(message), { expose: true })

/**
 * Validates cart items and returns trusted line items and totals.
 * Throws an error with `expose: true` and a user-friendly message on invalid input.
 */
export const priceCartItems = async (rawItems) => {
    if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > MAX_LINE_ITEMS) {
        throw pricingError('Invalid order details')
    }

    const requested = rawItems.map((item) => {
        const id = item && typeof item === 'object' ? String(item._id ?? '') : ''
        const quantity = Number(item?.quantity)
        const format = typeof item?.format === 'string' && item.format.trim() ? item.format.trim().slice(0, 60) : formatFromName(item?.name)
        if (!isObjectId(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
            throw pricingError('Invalid order details')
        }
        return { id, quantity, format }
    })

    const books = await bookModel.find({ _id: { $in: [...new Set(requested.map(r => r.id))] } }).lean()
    const bookMap = new Map(books.map(b => [String(b._id), b]))

    let subtotal = 0
    const items = requested.map(({ id, quantity, format }) => {
        const book = bookMap.get(id)
        if (!book) throw pricingError('One of the books in your cart is no longer available. Please refresh your cart.')
        const outOfStock = book.inStock === false || (Array.isArray(book.outOfStockSizes) &&
            book.outOfStockSizes.some(s => typeof s === 'string' && s.trim().toLowerCase() === format.toLowerCase()))
        if (outOfStock) throw pricingError(`'${book.title}' (${format}) is currently out of stock.`)

        const price = getFormatPrice(book.price, format)
        subtotal += price * quantity
        const image = Array.isArray(book.image) ? (book.image[0] || '') : (typeof book.image === 'string' ? book.image : '')
        return { _id: id, name: `${book.title} (${format})`, format, price, quantity, image }
    })

    return { items, subtotal, amount: computeOrderTotal(subtotal) }
}

const ADDRESS_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'street', 'line1', 'line2', 'city', 'state', 'zipcode', 'country']

/** Keeps only known address fields as bounded strings. Returns null if the address is unusable. */
export const sanitizeAddress = (address) => {
    if (!address || typeof address !== 'object' || Array.isArray(address)) return null
    const clean = {}
    for (const key of ADDRESS_FIELDS) {
        if (address[key] !== undefined && address[key] !== null) clean[key] = String(address[key]).slice(0, 200)
    }
    return (clean.street || clean.line1) ? clean : null
}
