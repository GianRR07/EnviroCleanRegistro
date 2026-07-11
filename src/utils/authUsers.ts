import { databases, ID, Query } from "@/utils/appwrite";

const DATABASE_ID = "enviroclean-db";
const APP_USERS_COLLECTION_ID = "app_users";

type AppUserRole = "admin" | "trabajador" | "cliente";

export type AppUser = {
  id?: string;
  appwriteId?: string;
  username: string;
  usernameLower: string;
  name: string;
  role: AppUserRole;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
  updateAt?: string;
};

const normalizeUsername = (username: string) => {
  return username.trim().toLowerCase();
};

const getPeruDate = () => {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
};

/**
 * Implementación ligera de SHA-256 en JavaScript puro para evitar agregar
 * dependencias nuevas al proyecto Expo/React Native.
 *
 * Se usa para NO guardar contraseñas en texto plano en Appwrite.
 */
const sha256 = (input: string) => {
  const ascii = unescape(encodeURIComponent(input));
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = "length";
  let i: number;
  let j: number;
  let result = "";
  const words: number[] = [];
  const asciiBitLength = ascii[lengthProperty] * 8;

  const hash = (sha256 as any).h || [];
  const k = (sha256 as any).k || [];
  let primeCounter = k[lengthProperty];
  const isComposite: Record<number, boolean> = {};

  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  (sha256 as any).h = hash;
  (sha256 as any).k = k;

  let paddedAscii = ascii + "\x80";
  while ((paddedAscii[lengthProperty] % 64) - 56) {
    paddedAscii += "\x00";
  }

  for (i = 0; i < paddedAscii[lengthProperty]; i++) {
    j = paddedAscii.charCodeAt(i);
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }

  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength;

  let workingHash = hash.slice(0, 8);

  for (j = 0; j < words[lengthProperty]; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = workingHash.slice(0, 8);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const a = workingHash[0];
      const e = workingHash[4];
      const temp1 =
        workingHash[7] +
        (((e >>> 6) | (e << 26)) ^
          ((e >>> 11) | (e << 21)) ^
          ((e >>> 25) | (e << 7))) +
        ((e & workingHash[5]) ^ (~e & workingHash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (((w15 >>> 7) | (w15 << 25)) ^
                  ((w15 >>> 18) | (w15 << 14)) ^
                  (w15 >>> 3)) +
                w[i - 7] +
                (((w2 >>> 17) | (w2 << 15)) ^
                  ((w2 >>> 19) | (w2 << 13)) ^
                  (w2 >>> 10))) |
              0);

      const temp2 =
        (((a >>> 2) | (a << 30)) ^
          ((a >>> 13) | (a << 19)) ^
          ((a >>> 22) | (a << 10))) +
        ((a & workingHash[1]) ^
          (a & workingHash[2]) ^
          (workingHash[1] & workingHash[2]));

      workingHash = [(temp1 + temp2) | 0].concat(workingHash);
      workingHash[4] = (workingHash[4] + temp1) | 0;
      workingHash.pop();
    }

    for (i = 0; i < 8; i++) {
      workingHash[i] = (workingHash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      const b = (workingHash[i] >> (j * 8)) & 255;
      result += (b < 16 ? "0" : "") + b.toString(16);
    }
  }

  return result;
};

export const buildPasswordHash = (username: string, password: string) => {
  const usernameLower = normalizeUsername(username);
  return sha256(`${usernameLower}::${password}`);
};

const sanitizeUser = (doc: any): AppUser => ({
  id: doc.$id,
  appwriteId: doc.$id,
  username: doc.username ?? "",
  usernameLower: doc.usernameLower ?? "",
  name: doc.name ?? "",
  role: doc.role ?? "cliente",
  active: doc.active !== false,
  createdAt: doc.createdAt ?? doc.$createdAt ?? "",
  updatedAt: doc.updatedAt ?? doc.updateAt ?? doc.$updatedAt ?? "",
  updateAt: doc.updateAt ?? doc.updatedAt ?? doc.$updatedAt ?? "",
});

export const authenticateAppUser = async (
  username: string,
  password: string,
): Promise<AppUser> => {
  const usernameLower = normalizeUsername(username);

  if (!usernameLower || !password) {
    throw new Error("Completa usuario y contraseña.");
  }

  const response = await databases.listDocuments(
    DATABASE_ID,
    APP_USERS_COLLECTION_ID,
    [Query.equal("usernameLower", usernameLower), Query.limit(1)],
  );

  if (!response.documents || response.documents.length === 0) {
    throw new Error("Usuario o contraseña incorrectos.");
  }

  const userDoc = response.documents[0] as any;

  if (userDoc.active === false) {
    throw new Error("Este usuario está inactivo. Comunícate con el administrador.");
  }

  const expectedHash = buildPasswordHash(usernameLower, password);

  if (userDoc.passwordHash !== expectedHash) {
    throw new Error("Usuario o contraseña incorrectos.");
  }

  return sanitizeUser(userDoc);
};

export const getAppUsers = async (): Promise<AppUser[]> => {
  const response = await databases.listDocuments(
    DATABASE_ID,
    APP_USERS_COLLECTION_ID,
    [Query.orderDesc("$createdAt"), Query.limit(100)],
  );

  return (response.documents || []).map(sanitizeUser);
};

export const createAppUser = async ({
  username,
  password,
  role,
  name,
}: {
  username: string;
  password: string;
  role: AppUserRole;
  name?: string;
}) => {
  const usernameClean = username.trim();
  const usernameLower = normalizeUsername(usernameClean);

  if (!usernameLower) throw new Error("Escribe un usuario.");
  if (!password || password.length < 6) {
    throw new Error("La contraseña debe tener al menos 6 caracteres.");
  }
  if (!["admin", "trabajador", "cliente"].includes(role)) {
    throw new Error("Selecciona un rol válido.");
  }

  const existing = await databases.listDocuments(
    DATABASE_ID,
    APP_USERS_COLLECTION_ID,
    [Query.equal("usernameLower", usernameLower), Query.limit(1)],
  );

  if (existing.documents && existing.documents.length > 0) {
    throw new Error("Ya existe un usuario con ese nombre.");
  }

  const now = getPeruDate();

  const response = await databases.createDocument(
    DATABASE_ID,
    APP_USERS_COLLECTION_ID,
    ID.unique(),
    {
      username: usernameClean,
      usernameLower,
      passwordHash: buildPasswordHash(usernameLower, password),
      role,
      name: name?.trim() || usernameClean,
      active: true,
      createdAt: now,
      updateAt: now,
    },
  );

  return sanitizeUser(response);
};
