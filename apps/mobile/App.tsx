import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ApolloProvider } from "@apollo/client/react";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";

import { apolloClient } from "./src/apollo";
import { TrackScreen } from "./src/screens/TrackScreen";
import { AdminScreen } from "./src/screens/AdminScreen";
import { AppToast } from "./src/components/AppToast";
import { linking } from "./src/links";
import { font } from "./src/theme/fonts";
import { useTheme } from "./src/theme/theme";

const Tab = createBottomTabNavigator();

function Root() {
  const t = useTheme();
  const base = t.dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: t.bg,
      card: t.bg,
      text: t.text,
      border: t.border,
      primary: t.status.PICKED_UP,
    },
  };

  return (
    <NavigationContainer theme={navTheme} linking={linking}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarLabelStyle: { fontFamily: font.medium },
        }}
      >
        <Tab.Screen
          name="Track"
          component={TrackScreen}
          options={{
            tabBarIcon: ({ color, size }) => <Ionicons name="search" color={color} size={size} />,
          }}
        />
        <Tab.Screen
          name="Admin"
          component={AdminScreen}
          options={{
            tabBarIcon: ({ color, size }) => <Ionicons name="shield-checkmark" color={color} size={size} />,
          }}
        />
      </Tab.Navigator>
      <AppToast />
      <StatusBar style={t.dark ? "light" : "dark"} />
    </NavigationContainer>
  );
}

export default function App() {
  const t = useTheme();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });

  // Hold the first render until Inter is ready so text doesn't flash in the system font.
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: t.bg }} />;

  return (
    <ApolloProvider client={apolloClient}>
      <SafeAreaProvider>
        <Root />
      </SafeAreaProvider>
    </ApolloProvider>
  );
}
