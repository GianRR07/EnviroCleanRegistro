import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { BackHandler, Platform } from "react-native";

export function useAndroidBackHandler(handler: () => boolean) {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return undefined;

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => handlerRef.current(),
      );

      return () => subscription.remove();
    }, []),
  );
}
