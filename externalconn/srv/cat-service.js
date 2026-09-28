import cds from '@sap/cds'
import DeepSeekChatModel from './deepseek-llm.js'

export class CatalogService extends cds.ApplicationService { init() {

  // Real LLM for the A2A ReAct loop (@cap-js/agents `buildModel`).
  // Overrides the default `cds.connect.to('llm')` (which was llm-mock).
  // FIFO semantics give this app handler priority over the default.
  this.on('buildModel', async () => new DeepSeekChatModel('CatalogService', {}))

  const { Books } = cds.entities('sap.capire.bookshop')
  const { ListOfBooks } = this.entities

  // Add some discount for overstocked books
  this.after('each', ListOfBooks, book => {
    if (book.stock > 111) book.title += ` -- 11% discount!`
  })

  // Reduce stock of ordered books if available stock suffices
  this.on('submitOrder', async req => {
    let { book:id, quantity } = req.data
    let book = await SELECT.one.from (Books, id, b => b.stock)

    // Validate input data
    if (!book) return req.error (404, `Book #${id} doesn't exist`)
    if (quantity < 1) return req.error (400, `quantity has to be 1 or more`)
    if (!book.stock || quantity > book.stock) return req.error (409, `${quantity} exceeds stock for book #${id}`)

    // Reduce stock in database and return updated stock value
    await UPDATE (Books, id) .with ({ stock: book.stock -= quantity })
    return book
  })

  // Emit event when an order has been submitted
  this.after('submitOrder', async (_,req) => {
    let { book, quantity } = req.data
    await this.emit('OrderedBook', { book, quantity, buyer: req.user.id })
  })

  // Delegate requests to the underlying generic service
  return super.init()
}}
