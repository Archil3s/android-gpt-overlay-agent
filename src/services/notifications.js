import notifee, { AndroidImportance } from "@notifee/react-native";

const CHANNELS = {
  git: "git-confirm",
  agent: "agent-status"
};

export async function initializeNotifications() {
  await notifee.requestPermission();

  await notifee.createChannel({
    id: CHANNELS.git,
    name: "Git confirmations",
    importance: AndroidImportance.HIGH,
    lights: true,
    lightColor: "#FFB800"
  });

  await notifee.createChannel({
    id: CHANNELS.agent,
    name: "Agent status",
    importance: AndroidImportance.DEFAULT,
    lights: true,
    lightColor: "#A78BFA"
  });
}

export async function notifyGitPushRequest(request) {
  return notifee.displayNotification({
    title: "Git push approval required",
    body: `${request?.branch ?? "Unknown branch"} needs approval`,
    android: {
      channelId: CHANNELS.git,
      color: "#FFB800",
      pressAction: { id: "default" }
    }
  });
}

export async function notifyAgentStatus(status) {
  return notifee.displayNotification({
    title: `Agent: ${status?.status ?? "update"}`,
    body: status?.currentStep || status?.goal || "Agent status updated",
    android: {
      channelId: CHANNELS.agent,
      color: "#A78BFA",
      pressAction: { id: "default" }
    }
  });
}

export async function notifyAgentApprovalRequired(request) {
  return notifee.displayNotification({
    title: "Agent push approval required",
    body: request?.goal || "The coding agent is ready to push",
    android: {
      channelId: CHANNELS.git,
      color: "#00FF88",
      pressAction: { id: "default" }
    }
  });
}
