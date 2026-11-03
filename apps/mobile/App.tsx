import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { ApolloProvider } from "@apollo/client/react";

import { apolloClient } from "./src/apollo";
import { TrackScreen } from "./src/screens/TrackScreen";
import { AdminScreen } from "./src/screens/AdminScreen";

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <ApolloProvider client={apolloClient}>
      <SafeAreaProvider>
        <NavigationContainer>
          <Tab.Navigator screenOptions={{ headerShown: false }}>
            <Tab.Screen
              name="Track"
              component={TrackScreen}
              options={{
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="search" color={color} size={size} />
                ),
              }}
            />
            <Tab.Screen
              name="Admin"
              component={AdminScreen}
              options={{
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="shield-checkmark" color={color} size={size} />
                ),
              }}
            />
          </Tab.Navigator>
        </NavigationContainer>
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </ApolloProvider>
  );
}
