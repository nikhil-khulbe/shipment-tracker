// Native modules that don't exist under Jest get the libraries' own official mocks.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
