import { PersistenceAdapter } from '../services/PersistenceAdapter';

export async function handleLtdCustomerFlow(
    customerId: string,
    personalDetails: {
        fullName: string;
        identityId: string;
        phoneNumber: string;
        address: string;
        email: string;
    },
    modal: any,
    navigate: (path: string) => void
): Promise<void> {
    const { data: allCustomers } = await PersistenceAdapter.fetchAllCustomers();
    const existingMatch = allCustomers?.find((c: any) =>
        c.customerDetails.identityId === personalDetails.identityId &&
        c.id !== customerId &&
        c.businessDetails?.businessType === 'חברה בע"מ'
    );
    if (existingMatch) return;

    await PersistenceAdapter.insertSubtaskUnderRegistry(
        customerId,
        'ADMIN_SETUP',
        `פתיחת תיק לקוח נוסף עבור ${personalDetails.fullName}`
    );

    modal.custom({
        title: 'חברה בע"מ',
        message: 'עבור תיק עסק שהוא חברה בע"מ, נדרש לפתוח תיק לקוח נוסף.',
        buttons: [
            {
                label: 'הוסף תיק לקוח',
                variant: 'primary',
                onClick: () => {
                    modal.alert('שומר תיק לקוח ועובר לרישום תיק לקוח חדש...', undefined, 2000).then(() => {
                        navigate('/admin/customers/new', { state: personalDetails });
                    });
                },
            },
            { label: 'אישור', variant: 'secondary', onClick: () => {} },
        ],
    });
}
