import { TEST_PASSWORD_PARAMS, setPasswordCostForTests } from '@/auth/password';

// Production hashes use scrypt N=2^17 (about a third of a second each). Tests hash hundreds of
// passwords, so they use a cheap cost; `setPasswordCostForTests` refuses to run outside vitest.
setPasswordCostForTests(TEST_PASSWORD_PARAMS);
