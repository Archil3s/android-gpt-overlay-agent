import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import {
  handlePuterBridgeMessage,
  initializePuterBridge,
  PUTER_WEBVIEW_HTML
} from "../services/puter";

export default function PuterBridge() {
  const webViewRef = useRef(null);

  useEffect(() => {
    initializePuterBridge(webViewRef);
  }, []);

  return (
    <View pointerEvents="none" style={styles.hidden}>
      <WebView
        ref={webViewRef}
        originWhitelist={["*"]}
        source={{ html: PUTER_WEBVIEW_HTML }}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        onMessage={handlePuterBridgeMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    left: -10,
    top: -10
  }
});
