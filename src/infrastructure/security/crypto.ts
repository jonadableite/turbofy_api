import { randomBytes, createCipheriv, createDecipheriv } from "crypto"
import { env } from "../../config/env"

const KEY = Buffer.from(env.TURBOFY_CREDENTIALS_ENC_KEY.slice(0, 32))

export const encryptSecret = (plain: string): string => {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", KEY, iv)
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString("hex")}:${enc.toString("hex")}:${tag.toString("hex")}`
}

export const decryptSecret = (packed: string): string => {
  const [ivHex, encHex, tagHex] = packed.split(":")
  const iv = Buffer.from(ivHex, "hex")
  const enc = Buffer.from(encHex, "hex")
  const tag = Buffer.from(tagHex, "hex")
  const decipher = createDecipheriv("aes-256-gcm", KEY, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(enc), decipher.final()])
  return dec.toString("utf8")
}
