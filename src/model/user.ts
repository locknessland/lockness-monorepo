export class User {
  id?: number
  createdAt?: Date
  updatedAt?: Date

  constructor(data: Partial<User>) {
    Object.assign(this, data)
  }
}
