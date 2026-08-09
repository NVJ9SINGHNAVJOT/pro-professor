package com.proprofessor.server.chat.dto;

/**
 * Renames a conversation from the sidebar.
 *
 * <p>Titles are normally derived — from the first message, or from the first spoken turn — so this
 * is the one place a user sets one deliberately.
 */
public record ChatRenameRequest(String title) {
}
