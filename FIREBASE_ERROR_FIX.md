# 🔧 Firebase Error Fix Guide

## 🚨 Problem: 
```
Console FirebaseError
Function where() called with invalid data. Unsupported field value: undefined
```

## ✅ Solutions Implemented:

### 1. **Scoreboard Page** (`src/app/scoreboard/page.js`)
- **Line 907**: Added null check for `selectedEvent.id`
- **Line 907**: `if (!selectedEvent || !selectedEvent.id) return;`

### 2. **Admin Scoreboard Page** (`src/app/admin/scoreboard/page.js`)
- **Line 207**: Added null check for `selectedEvent.id`
- **Line 207**: `if (!selectedEvent || !selectedEvent.id) { return; }`

### 3. **Admin Dashboard Page** (`src/app/admin/dashboard/page.js`)
- **Line 245**: Added null check for `selectedEventForPrint.id`
- **Line 245**: `if (!selectedEventForPrint || !selectedEventForPrint.id) { return; }`

## 🔧 **Root Cause Analysis:**

Ang error ay nangyayari kapag:
1. **Undefined na `selectedEvent.id`** - Kapag ang `selectedEvent` ay `null` o `undefined`, ang `.id` property ay `undefined`
2. **Undefined na `selectedEventForPrint.id`** - Same issue sa admin dashboard
3. **Undefined na field values** - Ipinapasa sa `where()` query na may `undefined`

## 📋 **Pattern to Fix:**

```javascript
// ❌ Maling (may cause error):
where('eventId', '==', selectedEvent.id)

// ✅ Tama (may error):
if (!selectedEvent || !selectedEvent.id) return;
where('eventId', '==', selectedEvent.id)
```

## 🛡️ **Additional Checks:**

Kung mayroon pa error, i-check ang mga sumusunod:

1. **Event Initialization**:
   ```javascript
   console.log('Selected Event:', selectedEvent);
   console.log('Selected Event ID:', selectedEvent?.id);
   ```

2. **User Authentication**:
   ```javascript
   console.log('Current User:', auth.currentUser);
   console.log('User ID:', auth.currentUser?.uid);
   ```

3. **Query Parameters**:
   ```javascript
   // Log before query
   console.log('Query Parameters:', { eventId: selectedEvent?.id });
   ```

## 🔍 **Debugging Steps:**

1. **Open Browser Console**
2. **Look for undefined values**
3. **Check event loading sequence**
4. **Verify user authentication state**

## 📝 **Firestore Rules Update (Optional):**

Kung kailangan, dagdagan ang firestore.rules:

```javascript
match /scores/{id} {
  allow read: if request.auth != null && request.auth.uid == resource.data.judgeId;
  allow write: if request.auth != null && request.auth.uid == resource.data.judgeId;
}
```

Ito ay nagagarang ang judge isolation sa database level.

## 🎯 **Testing:**

1. **Load page na may event**
2. **Check console logs**
3. **Verify queries are working**
4. **Test with different data states**

Ang fixes na ito ay dapat na solusyunan ang `undefined` error sa Firebase queries!
