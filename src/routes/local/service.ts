import AllRecipeUser from '$models/all_recipe_user'
import EmailVerification from '$models/email_verification'
import LocalUser, { ILocalUser } from '$models/local_user'
import LocalVerifiedEmail from '$models/local_verified_emails'
import { getConnection, QueryFailedError } from 'typeorm'

type Ox<T extends object, K extends keyof T> = Omit<T, K>
type CreateUserInput = Ox<
  ILocalUser,
  '_id' | 'createdAt' | 'updatedAt' | 'photoUrl' | 'fullName'
>

export async function createUser(input: CreateUserInput) {
  const { email, firstName, lastName, hash, salt, birthDate } = input

  const localUser = getConnection()
    .createQueryBuilder(LocalUser, 'local')
    .insert()
    .values({
      email,
      firstName,
      lastName,
      hash,
      salt,
      birthDate,
    })
    .returning(['_id'])

  const [rawUser] = await getConnection().manager.query(
    /*sql*/ `
      WITH "local" AS (
          ${localUser.getSql()}
      )
      INSERT INTO "all_recipe_user"(user_id) SELECT _id FROM "local" RETURNING *;
    `,
    Object.values(localUser.getParameters())
  )

  const user = new AllRecipeUser()
  user.userId = rawUser.user_id
  user.createdAt = rawUser.created_at
  user.recipe = rawUser.recipe

  return user
}

export async function createVerificationToken({
  id,
  email,
  token,
  expiration,
}: CreateVerificationToken) {
  // const result = await EmailVerification.upsert(
  //   {
  //     _id: id,
  //     email,
  //     verificationToken: token,
  //     verificationTokenExpiry: expiration,
  //   },
  //   { conflictPaths: ['email'] }
  // )

  await getConnection()
    .createQueryBuilder(EmailVerification, 'verification')
    .insert()
    .values({
      _id: id,
      email,
      verificationToken: token,
      verificationTokenExpiry: expiration,
    })
    .orUpdate({
      conflict_target: ['email'],
      overwrite: ['verification_token', 'verification_token_expiry'],
    })
    .execute()
}

export async function getVerificationToken(token: string, exp: number) {
  const emailVerification = await getConnection()
    .createQueryBuilder(EmailVerification, 'verification')
    .where(
      'verification.verification_token = :token AND verification.verification_token_expiry < :exp',
      { token, exp }
    )
    .limit(1)
    .getOne()
  if (!emailVerification) {
    throw new Error('Invalid token!')
  }

  return emailVerification
}

export async function createVerifiedUser(userId: string, email: string) {
  const result = await getConnection()
    .createQueryBuilder(LocalVerifiedEmail, 'verified')
    .insert()
    .values({ userId, email })
    .returning('*')
    .execute()

  return LocalVerifiedEmail.create(result.generatedMaps[0])
}

export interface CreateVerificationToken {
  id: string
  email: string
  token: string
  expiration: number
}
