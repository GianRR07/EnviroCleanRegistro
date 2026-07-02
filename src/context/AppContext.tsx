import { createContext, useContext, useState } from "react";

const AppContext = createContext<any>(null);

export const AppProvider = ({ children }: any) => {
  const [users, setUsers] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);

  const addUser = (user: any) => {
    setUsers((prev) => [...prev, user]);
  };

  const addRecord = (record: any) => {
    setRecords((prev) => [...prev, record]);
  };

  return (
    <AppContext.Provider
      value={{
        users,
        setUsers,
        addUser,
        records,
        setRecords,
        addRecord,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);