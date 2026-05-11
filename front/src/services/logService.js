// src/services/logService.js

export const logService = {
  async recordAction (actionType, details) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      user: localStorage.getItem('user_name') || 'unknown',
      action: actionType,
      details: details, // כאן נשמור למשל את שם הלקוח שנוסף
    };

    console.log("Activity Logged:", logEntry);

    // שליחה לטבלת התיעוד ב-DB
    try {
      await fetch('YOUR_DB_ENDPOINT/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logEntry),
      });
    } catch (err) {
      console.error("Failed to log action", err);
    }
  }
};