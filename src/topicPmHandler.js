import { allowed_updates, postToTelegramApi } from './core.js';

// ---------------------------------------- MOTHER BOT ----------------------------------------

export async function motherBotCommands(botToken, ownerUid, message, childBotUrl, childBotSecretToken) {
  const sendRespMessage = async function (chat_id, text) {
    return await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: chat_id,
      text: text,
    });
  }

  try {
    if (message.text.startsWith("/install ")) {
      const childBotOwnerId = message.from.id.toString();
      const childBotToken = message.text.split("/install ")[1];
      const setWebhookResp = await (await postToTelegramApi(childBotToken, 'setWebhook', {
        url: `${childBotUrl.endsWith('/') ? childBotUrl.slice(0, -1) : childBotUrl}/webhook/${childBotOwnerId}/${childBotToken}`,
        allowed_updates: allowed_updates,
        secret_token: childBotSecretToken
      })).json();
      if (setWebhookResp.ok) {
        await sendRespMessage(message.chat.id, `bot ${childBotToken} install success!`);
      } else {
        await sendRespMessage(message.chat.id, `bot ${childBotToken} install failed! ${JSON.stringify(setWebhookResp)}`);
      }
    } else if (message.text.startsWith("/uninstall ")) {
      const childBotToken = message.text.split("/uninstall ")[1];
      const deleteWebhookResp = await (await postToTelegramApi(childBotToken, 'deleteWebhook', {})).json();
      if (deleteWebhookResp.ok) {
        await sendRespMessage(message.chat.id, `bot ${childBotToken} uninstall success!`);
      } else {
        await sendRespMessage(message.chat.id, `bot ${childBotToken} uninstall failed! ${JSON.stringify(deleteWebhookResp)}`);
      }
    } else {
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: message.chat.id,
        text: `has no this command! Try '/install {{botToken}}' OR '/uninstall {{botToken}}'`,
      });
    }
    return new Response('OK');
  } catch (error) {
    console.error('Error handling webhook:', error.message);
    // --- for debugging ---
    // await postToTelegramApi(botToken, 'sendMessage', {
    //     chat_id: ownerUid,
    //     text: `Error handling webhook: ${error.message}`,
    // });
    // --- for debugging ---
    return new Response('OK');
  }
}

// ---------------------------------------- SETTINGS ----------------------------------------

export async function init(botToken, ownerUid, message) {
  try {
    const supergroupId = message.chat.id;
    const metaDataMessage = supergroupId.toString();

    let failed = false;
    let failedMessage = "init failed, please try again";
    let sendMetaDataMessageResp;
    let pinMetaDataMessageResp;

    const check = await doCheckInit(botToken, ownerUid)
    if (!check.failed) {
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: ownerUid,
        text: "already init!",
      });
      return new Response('OK');
    }

    sendMetaDataMessageResp = await (await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: ownerUid,
      text: metaDataMessage,
    })).json();
    if (!sendMetaDataMessageResp.ok) {
      failedMessage += " sendMetaDataMessageResp: " + JSON.stringify(sendMetaDataMessageResp);
      failed = true;
    }
    if (!failed) {
      pinMetaDataMessageResp = await (await postToTelegramApi(botToken, 'pinChatMessage', {
        chat_id: ownerUid,
        message_id: sendMetaDataMessageResp.result.message_id,
      })).json();
      if (!pinMetaDataMessageResp.ok) {
        failedMessage += " pinMetaDataMessageResp: " + JSON.stringify(pinMetaDataMessageResp);
        failed = true;
      }
    }
    return checkInit(botToken, ownerUid, message, failed, failedMessage);
  } catch (error) {
    console.error('Error handling webhook:', error.message);
    // // --- for debugging ---
    // await postToTelegramApi(botToken, 'sendMessage', {
    //     chat_id: ownerUid,
    //     text: `Error handling webhook: ${error.message}`,
    // });
    // // --- for debugging ---
    return new Response('OK');
  }
}

export async function checkInit(botToken, ownerUid, message, failed, failedMessage) {
  try {
    const supergroupId = message.chat.id;

    failed = failed || false;
    failedMessage = failedMessage || "init check failed, please do init or try again";
    let checkMetaDataMessageResp;
    if (!failed) {
      const doCheckInitRet = await doCheckInit(botToken, ownerUid, failedMessage, failed);
      checkMetaDataMessageResp = doCheckInitRet.checkMetaDataMessageResp;
      failedMessage = doCheckInitRet.failedMessage;
      failed = doCheckInitRet.failed;
    }
    if (failed) {
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: ownerUid,
        text: `GROUP ${supergroupId}: ${failedMessage}`,
      });
    } else {
      const { superGroupChatId: superGroupIdFromMetaDataMessage }
          = parseMetaDataMessage(checkMetaDataMessageResp.result.pinned_message);
      if (superGroupIdFromMetaDataMessage !== supergroupId) {
        await postToTelegramApi(botToken, 'sendMessage', {
          chat_id: ownerUid,
          text: `GROUP ${supergroupId}: init failed! Cause already init GROUP ${superGroupIdFromMetaDataMessage}`,
        });
      } else {
        await postToTelegramApi(botToken, 'sendMessage', {
          chat_id: ownerUid,
          text: `GROUP ${supergroupId}: init success!`,
        });
      }
    }
    return new Response('OK');
  } catch (error) {
    console.error('Error handling webhook:', error.message);
    // // --- for debugging ---
    // await postToTelegramApi(botToken, 'sendMessage', {
    //     chat_id: ownerUid,
    //     text: `Error handling webhook: ${error.message}`,
    // });
    // // --- for debugging ---
    return new Response('OK');
  }
}

export async function doCheckInit(botToken, ownerUid, failedMessage, failed) {
  const checkMetaDataMessageResp = await (await postToTelegramApi(botToken, 'getChat', {
    chat_id: ownerUid,
  })).json();
  if (!checkMetaDataMessageResp.ok || !checkMetaDataMessageResp.result.pinned_message?.text) {
    failedMessage += " checkMetaDataMessageResp: " + JSON.stringify(checkMetaDataMessageResp);
    failed = true;
  }
  return { checkMetaDataMessageResp, failedMessage, failed };
}

export function parseMetaDataMessage(metaDataMessage) {
  const metaDataSplit = metaDataMessage.text.split(";");
  let superGroupChatId = parseInt(metaDataSplit[0]);
  let topicToFromChat = new Map;
  let fromChatToTopic = new Map;
  if (metaDataSplit.length > 1) {
    for (let i = 1; i < metaDataSplit.length; i++) {
      const topicToFromChatSplit = metaDataSplit[i].split(":");
      const topic = parseInt(topicToFromChatSplit[0]);
      const fromChat = parseInt(topicToFromChatSplit[1]);
      topicToFromChat.set(topic, fromChat);
      fromChatToTopic.set(fromChat, topic);
    }
  }
  return { superGroupChatId, topicToFromChat, fromChatToTopic };
}

async function addTopicToFromChatOnMetaData(botToken, metaDataMessage, ownerUid, topicId, fromChatId) {
  const newText = `${metaDataMessage.text};${topicId}:${fromChatId}`
  await postToTelegramApi(botToken, 'editMessageText', {
    chat_id: ownerUid,
    message_id: metaDataMessage.message_id,
    text: newText,
  });
  return { newText };
}

async function cleanItemOnMetaData(botToken, metaDataMessage, ownerUid, topicId) {
  const oldText = metaDataMessage.text;
  let itemStartIndex = oldText.indexOf(`;${topicId}:`) + 1;
  let itemEndIndex = oldText.indexOf(';', itemStartIndex);
  let newText = itemEndIndex === -1 ? oldText.substring(0, itemStartIndex - 1)
      : oldText.replace(oldText.substring(itemStartIndex, itemEndIndex + 1), '');
  await postToTelegramApi(botToken, 'editMessageText', {
    chat_id: ownerUid,
    message_id: metaDataMessage.message_id,
    text: newText,
  });
  metaDataMessage.text = newText;
  return { newText };
}

export async function reset(botToken, ownerUid, message, inOwnerChat) {
  try {
    const supergroupId = message.chat.id;

    let unpinMetaDataMessageResp;

    const check = await doCheckInit(botToken, ownerUid)
    if (!check.failed) {
      const { superGroupChatId: superGroupChatIdFromMetaData }
          = parseMetaDataMessage(check.checkMetaDataMessageResp.result.pinned_message)
      if (inOwnerChat || superGroupChatIdFromMetaData === supergroupId) {
        unpinMetaDataMessageResp = await (await postToTelegramApi(botToken, 'unpinAllChatMessages', {
          chat_id: ownerUid,
        })).json();
        if (!unpinMetaDataMessageResp.ok) {
          await postToTelegramApi(botToken, 'sendMessage', {
            chat_id: ownerUid,
            text: `Reset failed!`,
          });
        } else {
          await postToTelegramApi(botToken, 'sendMessage', {
            chat_id: ownerUid,
            text: `Reset success!`,
          });
        }
      } else {
        await postToTelegramApi(botToken, 'sendMessage', {
          chat_id: ownerUid,
          text: `Can't reset from group isn't current using!`,
        });
      }
    } else {
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: ownerUid,
        text: "not init yet!",
      });
      return new Response('OK');
    }
  } catch (error) {
    console.error('Error handling webhook:', error.message);
    // // --- for debugging ---
    // await postToTelegramApi(botToken, 'sendMessage', {
    //     chat_id: ownerUid,
    //     text: `Error handling webhook: ${error.message}`,
    // });
    // // --- for debugging ---
    return new Response('OK');
  }
}

// ---------------------------------------- PRIVATE MESSAGE ----------------------------------------

export async function processPMReceived(botToken, ownerUid, message, superGroupChatId, fromChatToTopic, metaDataMessage) {
  const fromChat = message.chat;
  const fromChatId = fromChat.id;
  const pmMessageId = message.message_id;
  let topicId = fromChatToTopic.get(fromChatId);
  let isNewTopic = false;
  let fromChatName
  if (!topicId) {
    fromChatName = fromChat.username ?
        `@${fromChat.username}` : [fromChat.first_name, fromChat.last_name].filter(Boolean).join(' ');
    let topicName = `${fromChatName} ${fromChatId === message.from.id ? `(${fromChatId})` : `(${fromChatId})(${message.from.id})`}`
    const lengthCheckDo = function (topicName, newTopicName) {
      if (topicName.length > 128) {
        return newTopicName;
      } else {
        return topicName
      }
    }
    topicName = lengthCheckDo(topicName, `${fromChatName} (${fromChatId})`);
    topicName = lengthCheckDo(topicName, fromChatName);
    topicName = lengthCheckDo(topicName, fromChatName.substring(0, 127));
    const createTopicResp = await (await postToTelegramApi(botToken, 'createForumTopic', {
      chat_id: superGroupChatId,
      name: topicName,
    })).json();
    topicId = createTopicResp.result?.message_thread_id
    await addTopicToFromChatOnMetaData(botToken, metaDataMessage, ownerUid, topicId, fromChatId);
    isNewTopic = true;
  }

  // forwardMessage to topic
  const forwardMessageResp = await (await postToTelegramApi(botToken, 'forwardMessage', {
    chat_id: superGroupChatId,
    message_thread_id: topicId,
    from_chat_id: fromChatId,
    message_id: pmMessageId,
  })).json();
  if (forwardMessageResp.ok) {
    const topicMessageId = forwardMessageResp.result.message_id;
    if (isNewTopic) {
      // send PM to bot owner for the bad notification on super group for first message
      let messageLink;
      if (superGroupChatId.toString().startsWith("-100")) {
        messageLink = `https://t.me/c/${superGroupChatId.toString().substring(4)}/${topicId}/${topicMessageId}`
      }
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: ownerUid,
        text: `${messageLink
            ? `New PM chat from ${fromChatName}.\nClick the link below to view it in your PM_SUPERGROUP:\n${messageLink}`
            : `New PM chat from ${fromChatName}, Go view it in your PM_SUPERGROUP`}`,
      });
    }
    // save messageId connection to superGroupChat pin message
    await saveMessageConnection(botToken, superGroupChatId, topicId, topicMessageId, pmMessageId, ownerUid);
    // notify sending status by MessageReaction
    await postToTelegramApi(botToken, 'setMessageReaction', {
      chat_id: fromChatId,
      message_id: pmMessageId,
      reaction: [{ type: "emoji", emoji: "🕊" }]
    });
  } else if (forwardMessageResp.description.includes('message thread not found')) {
    // clean metadata message
    await cleanItemOnMetaData(botToken, metaDataMessage, ownerUid, topicId);
    fromChatToTopic.delete(topicId)
    // resend the message
    await processPMReceived(botToken, ownerUid, message, superGroupChatId, fromChatToTopic, metaDataMessage)
  }
}

export async function processPMSent(botToken, message, topicToFromChat) {
  const ownerUid = message.from.id;
  const topicId = message.message_thread_id;
  const superGroupChatId = message.chat.id;
  const topicMessageId = message.message_id;
  const pmChatId = topicToFromChat.get(message.message_thread_id)
  const copyMessageResp = await (await postToTelegramApi(botToken, 'copyMessage', {
    chat_id: pmChatId,
    from_chat_id: superGroupChatId,
    message_id: topicMessageId
  })).json();
  if (copyMessageResp.ok) {
    const pmMessageId = copyMessageResp.result.message_id
    // save messageId connection to group pin message
    await saveMessageConnection(botToken, superGroupChatId, topicId, topicMessageId, pmMessageId, ownerUid);
    // notify sending status by MessageReaction
    await postToTelegramApi(botToken, 'setMessageReaction', {
      chat_id: superGroupChatId,
      message_id: topicMessageId,
      reaction: [{ type: "emoji", emoji: "🕊" }]
    });
  }
}

// ---------------------------------------- MESSAGE CONNECTION ----------------------------------------

async function checkMessageConnectionMetaData(botToken, superGroupChatId, failedMessage, failed) {
  let metaDataMessageId;
  let metaDataMessageText;
  let metaDataMessage;
  failedMessage = failedMessage || '';
  failed = failed || false;
  const checkMetaDataMessageResp = await (await postToTelegramApi(botToken, 'getChat', {
    chat_id: superGroupChatId,
  })).json();
  if (!checkMetaDataMessageResp.ok || !checkMetaDataMessageResp.result.pinned_message?.text) {
    failedMessage += " checkMetaDataMessageResp: " + JSON.stringify(checkMetaDataMessageResp);
    failed = true;
  } else {
    metaDataMessage = checkMetaDataMessageResp.result.pinned_message;
    metaDataMessageId = checkMetaDataMessageResp.result.pinned_message.message_id;
    metaDataMessageText = checkMetaDataMessageResp.result.pinned_message.text;
  }
  return { failedMessage, failed, metaDataMessageId, metaDataMessageText, metaDataMessage };
}

async function checkMessageConnectionMetaDataForAction(botToken, superGroupChatId, failedMessage, ownerUid) {
  const checkMessageConnectionMetaDataResp = await checkMessageConnectionMetaData(
      botToken, superGroupChatId, failedMessage);
  if (checkMessageConnectionMetaDataResp.failed) {
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: ownerUid,
      text: failedMessage,
    });
  }
  return checkMessageConnectionMetaDataResp;
}

async function saveMessageConnection(botToken, superGroupChatId, topicId, topicMessageId, pmMessageId, ownerUid) {
  let failed = false;
  let failedMessage = "Chat message connect failed, can't do emoji react, edit, delete.";
  const checkMessageConnectionMetaDataResp = await checkMessageConnectionMetaData(
      botToken, superGroupChatId, failedMessage, failed);
  failedMessage = checkMessageConnectionMetaDataResp.failedMessage;
  failed = checkMessageConnectionMetaDataResp.failed;
  let metaDataMessageId = checkMessageConnectionMetaDataResp.metaDataMessageId;
  let metaDataMessageText = checkMessageConnectionMetaDataResp.metaDataMessageText;
  if (failed) {
    // new message connection in superGroupChat pinned message
    failed = false;
    metaDataMessageText = `${topicId}-${topicMessageId}:${pmMessageId}`;
    const sendMetaDataMessageResp = await (await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: superGroupChatId,
      text: metaDataMessageText,
    })).json();
    if (!sendMetaDataMessageResp.ok) {
      failedMessage += " sendMetaDataMessageResp: " + JSON.stringify(sendMetaDataMessageResp);
      failed = true;
    }
    if (!failed) {
      metaDataMessageId = sendMetaDataMessageResp.result.message_id;
      const pinMetaDataMessageResp = await (await postToTelegramApi(botToken, 'pinChatMessage', {
        chat_id: superGroupChatId,
        message_id: metaDataMessageId,
      })).json();
      if (!pinMetaDataMessageResp.ok) {
        failedMessage += " pinMetaDataMessageResp: " + JSON.stringify(pinMetaDataMessageResp);
        failed = true;
      }
    }
  } else {
    // add message connection in superGroupChat pinned message
    metaDataMessageText = `${metaDataMessageText};${topicId}-${topicMessageId}:${pmMessageId}`;
    // text message max length 4096
    const processForTextMessageMaxLength = function (text, process) {
      if (text.length > 4096) {
        text = process(text);
        text = processForTextMessageMaxLength(text, process);
      }
      return text;
    }
    metaDataMessageText = processForTextMessageMaxLength(
        metaDataMessageText, (metaDataMessageText) => metaDataMessageText.split(';').slice(1).join(';'));
    const editMessageTextResp = await (await postToTelegramApi(botToken, 'editMessageText', {
      chat_id: superGroupChatId,
      message_id: metaDataMessageId,
      text: metaDataMessageText,
    })).json();
    if (!editMessageTextResp.ok) {
      failedMessage += " editMessageTextResp: " + JSON.stringify(editMessageTextResp);
      failed = true;
    }
  }
  if (failed) {
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: ownerUid,
      text: `GROUP ${superGroupChatId} MESSAGE ${topicId}-${topicMessageId}:${pmMessageId}: ${failedMessage}`,
    });
  }
}

// ---------------------------------------- EMOJI REACTION ----------------------------------------

export async function processERReceived(botToken, ownerUid, messageReaction, superGroupChatId) {
  const pmMessageId = messageReaction.message_id;
  let topicMessageId;
  let reaction = messageReaction.new_reaction;

  const checkMessageConnectionMetaDataResp =
      await checkMessageConnectionMetaDataForAction(botToken, superGroupChatId, "Can't sent EMOJI REACTION.", ownerUid);
  if (checkMessageConnectionMetaDataResp.failed) return;

  const messageConnectionTextSplit = checkMessageConnectionMetaDataResp.metaDataMessageText.split(';').reverse();
  for (let i = 0; i < messageConnectionTextSplit.length; i++) {
    const messageConnectionTextSplitSplit = messageConnectionTextSplit[i].split(':');
    if (pmMessageId === parseInt(messageConnectionTextSplitSplit[1])) {
      const topicMessageMetaData = messageConnectionTextSplitSplit[0];
      const topicMessageMetaDataSplit = topicMessageMetaData.split('-');
      topicMessageId = parseInt(topicMessageMetaDataSplit[1]);
      break;
    }
  }

  if (!topicMessageId) {
    return;
  }

  if (reaction.length === 0) {
    reaction = [
      {
        "type": "emoji",
        "emoji": "🕊"
      }
    ]
  }

  await sendEmojiReaction(botToken, superGroupChatId, topicMessageId, reaction, ownerUid);
}

export async function processERSent(botToken, messageReaction, topicToFromChat) {
  const ownerUid = messageReaction.user.id;
  const superGroupChatId = messageReaction.chat.id;
  let topicId;
  const topicMessageId = messageReaction.message_id;
  let pmChatId;
  let pmMessageId;
  let reaction = messageReaction.new_reaction;

  const checkMessageConnectionMetaDataResp =
      await checkMessageConnectionMetaDataForAction(botToken, superGroupChatId, "Can't sent EMOJI REACTION.", ownerUid);
  if (checkMessageConnectionMetaDataResp.failed) return;

  const messageConnectionTextSplit = checkMessageConnectionMetaDataResp.metaDataMessageText.split(';').reverse();
  for (let i = 0; i < messageConnectionTextSplit.length; i++) {
    const messageConnectionTextSplitSplit = messageConnectionTextSplit[i].split(':');
    const topicMessageMetaData = messageConnectionTextSplitSplit[0];
    const topicMessageMetaDataSplit = topicMessageMetaData.split('-');
    if (topicMessageId === parseInt(topicMessageMetaDataSplit[1])) {
      topicId = topicMessageMetaDataSplit[0];
      pmMessageId = messageConnectionTextSplitSplit[1];
      pmChatId = topicToFromChat.get(parseInt(topicId));
      break;
    }
  }

  if (!pmMessageId) {
    return;
  }

  if (reaction.length === 0) {
    reaction = [
      {
        "type": "emoji",
        "emoji": "🕊"
      }
    ]
  }

  await sendEmojiReaction(botToken, pmChatId, pmMessageId, reaction, ownerUid);
}

async function sendEmojiReaction(botToken, targetChatId, targetMessageId, reaction, ownerUid) {
  const setMessageReactionResp = await (await postToTelegramApi(botToken, 'setMessageReaction', {
    chat_id: targetChatId,
    message_id: targetMessageId,
    reaction: reaction
  })).json();
  if (!setMessageReactionResp.ok) {
    if (setMessageReactionResp.description.includes('REACTIONS_TOO_MANY')) {
      await postToTelegramApi(botToken, 'setMessageReaction', {
        chat_id: targetChatId,
        message_id: targetMessageId,
        reaction: reaction.slice(-1)
      });
    } else if (setMessageReactionResp.description.includes('REACTION_INVALID')) {
    } else {
      // TODO: 2025/5/6 --- for debugging ---
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: ownerUid,
        text: `setMessageReactionResp : ${JSON.stringify(setMessageReactionResp)}`,
      });
      // TODO: 2025/5/6 --- for debugging ---
    }
  }
}
