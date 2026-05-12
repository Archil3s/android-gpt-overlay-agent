import React, { useRef } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";

const COLORS = {
  accent: "#00FF88",
  pending: "#FFB800",
  agent: "#A78BFA",
  dark: "#080808"
};

export default function Bubble({ onPress, pendingGitCount = 0, agentActive = false }) {
  const position = useRef(new Animated.ValueXY({ x: 24, y: 120 })).current;
  const moved = useRef(false);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        moved.current = false;
        position.extractOffset();
      },
      onPanResponderMove: (_, gesture) => {
        if (Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3) moved.current = true;
        position.setValue({ x: gesture.dx, y: gesture.dy });
      },
      onPanResponderRelease: () => {
        position.flattenOffset();
        if (!moved.current) onPress?.();
      }
    })
  ).current;

  return (
    <Animated.View style={[styles.wrap, position.getLayout()]} {...responder.panHandlers}>
      <Pressable style={styles.bubble} onPress={onPress}>
        <Text style={styles.label}>AI</Text>
        {pendingGitCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pendingGitCount}</Text>
          </View>
        )}
        {agentActive && <View style={styles.agentDot} />}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", zIndex: 9999 },
  bubble: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10
  },
  label: { color: COLORS.dark, fontFamily: "JetBrains Mono", fontWeight: "800" },
  badge: {
    position: "absolute",
    right: -3,
    top: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.pending,
    alignItems: "center",
    justifyContent: "center"
  },
  badgeText: { color: COLORS.dark, fontFamily: "JetBrains Mono", fontSize: 11, fontWeight: "700" },
  agentDot: {
    position: "absolute",
    left: 1,
    bottom: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.agent,
    borderColor: COLORS.dark,
    borderWidth: 2
  }
});
