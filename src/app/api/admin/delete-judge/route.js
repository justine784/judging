import { getServerSideUser } from '@/lib/auth';
import { doc, deleteDoc, getDoc, getFirestore } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function DELETE(request) {
  try {
    // Verify the requester is an admin
    const user = await getServerSideUser();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized. Admin access required.' }, { status: 401 });
    }

    const { judgeId } = await request.json();
    
    if (!judgeId) {
      return Response.json({ error: 'Judge ID is required' }, { status: 400 });
    }

    // Prevent admins from deleting themselves
    if (user.uid === judgeId) {
      return Response.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    // Get the judge document to verify it exists
    const judgeDoc = await getDoc(doc(db, 'judges', judgeId));
    
    if (!judgeDoc.exists()) {
      return Response.json({ error: 'Judge not found' }, { status: 404 });
    }

    const judgeData = judgeDoc.data();

    // Delete judge document from Firestore
    await deleteDoc(doc(db, 'judges', judgeId));
    console.log(`Successfully deleted judge ${judgeId} from Firestore`);

    return Response.json({ 
      success: true, 
      message: `Judge ${judgeData.judgeName} has been deleted from the database.\n\nNote: The Firebase Authentication account still exists and requires manual deletion from the Firebase Console for complete removal.` 
    });

  } catch (error) {
    console.error('Error deleting judge:', error);
    return Response.json({ 
      error: 'Failed to delete judge', 
      details: error.message 
    }, { status: 500 });
  }
}
