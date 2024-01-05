import {library} from '@feasibleone/blong';

export default library(() => ({
    assert(checkWhat: unknown, compareTo: unknown, ifTrue: unknown, ifFalse: unknown) {
        if (checkWhat === compareTo) {
            if (typeof ifTrue === 'function') {
                return ifTrue();
            }
            return ifTrue;
        }
        if (typeof ifFalse === 'function') {
            return ifFalse();
        }
        return ifFalse;
    },
    keysByType: {
        // pair 04-05
        ZMK: {
            keyTypeCodePci: '000',
            keyTypeCodeNonPci: '000',
            description: 'Zone Master Key (also known as ZCMK)',
        },
        ZMKComp: {
            keyTypeCodePci: '100',
            keyTypeCodeNonPci: '100',
            description: 'Zone Master Key Component (legacy commands only)',
        },
        KML: {
            keyTypeCodePci: '200',
            keyTypeCodeNonPci: '200',
            description: 'Master Load Key (Visa Cash)',
        },
        KEKr: {
            keyTypeCodePci: '300',
            keyTypeCodeNonPci: '300',
            description: '(AS 2805) Key Encryption Key of Recipient',
        },
        KEKs: {
            keyTypeCodePci: '400',
            keyTypeCodeNonPci: '400',
            description: '(AS 2805) Key Encryption Key of Sender',
        },
        // pair 06-07
        ZPK: {
            keyTypeCodePci: '001',
            keyTypeCodeNonPci: '001',
            description: 'Zone PIN Key',
        },
        // does not work as ZKA !!!
        // ZKAMK_01: {
        //     keyTypeCodePci: '001',
        //     keyTypeCodeNonPci: '001',
        //     description: 'Zone Key Encryption Master Key'
        // },
        PEK_CUP0: {
            note: '(AS 2805) For use with Optional License HSM9-LIC003',
            keyTypeCodePci: '70D',
            keyTypeCodeNonPci: '001',
            description: '(AS 2805) PIN Encipherment Key',
        },
        // pair 14-15
        PVK: {
            keyTypeCodePci: '002',
            keyTypeCodeNonPci: '002',
            description: 'PIN Verification Key',
        },
        TPK: {
            keyTypeCodePci: '70D',
            keyTypeCodeNonPci: '002',
            description: 'Terminal PIN Key',
        },
        KEYVAL: {
            keyTypeCodePci: '70D',
            keyTypeCodeNonPci: '002',
            description: 'Terminal PIN Key',
        },
        TMK: {
            keyTypeCodePci: '80D',
            keyTypeCodeNonPci: '002',
            description: 'Terminal Master Key',
        },
        TKR: {
            keyTypeCodePci: '90D',
            keyTypeCodeNonPci: '002',
            description: 'Terminal Key Register',
        },
        PEK_CUP1: {
            note: '(AS 2805) For use with Optional License HSM9-LIC003',
            keyTypeCodePci: '70D',
            keyTypeCodeNonPci: '002',
            description: '(AS 2805) PIN Encipherment Key',
        },
        KT: {
            keyTypeCodePci: '80D',
            keyTypeCodeNonPci: '002',
            description: '(AS 2805) Transaction Key',
        },
        DBTAB: {
            keyTypeCodePci: '60D',
            keyTypeCodeNonPci: '002',
            description: 'Diebold table',
        },
        KCA: {
            keyTypeCodePci: '80D',
            keyTypeCodeNonPci: '002',
            description: '(AS 2805) Sponsor Cross Acquirer Key',
        },
        KMA: {
            keyTypeCodePci: '80D',
            keyTypeCodeNonPci: '002',
            description: '(AS 2805) Acquirer Master Key Encrypting Key',
        },
        KI: {
            keyTypeCodePci: '80D',
            keyTypeCodeNonPci: '002',
            description: '(AS 2805) Initial Transport Key',
        },
        PEK: {
            note: 'For use with Optional License HSM9-LIC031',
            keyTypeCodePci: '70D',
            keyTypeCodeNonPci: '002',
            description: '(LIC031) PIN Encryption Key',
        },
        TK: {
            keyTypeCodePci: '80D',
            keyTypeCodeNonPci: '002',
            description: '(AS 2805) Terminal Key',
        },
        PVVK: {
            keyTypeCodePci: '002',
            keyTypeCodeNonPci: '002',
            description: '(OBKM) PVV Key',
        },
        // does not work as ZKA !!!
        // ZKAMK_02: {
        //     keyTypeCodePci: '002',
        //     keyTypeCodeNonPci: '002',
        //     description: 'Zone Key Encryption Master Key'
        // },
        TMK1: {
            keyTypeCodePci: '102',
            keyTypeCodeNonPci: '102',
            description: '(AS 2805) Terminal Master Key',
        },
        TMK2: {
            keyTypeCodePci: '202',
            keyTypeCodeNonPci: '202',
            description: '(AS 2805) Terminal Master Key',
        },
        // IKEY = IPEK !!!
        IKEY: {
            keyTypeCodePci: '302',
            keyTypeCodeNonPci: '302',
            description: 'Initial Key (DUKPT)',
        },
        IPEK: {
            keyTypeCodePci: '302',
            keyTypeCodeNonPci: '302',
            description: 'Initial Key (DUKPT)',
        },
        CVK: {
            keyTypeCodePci: '402',
            keyTypeCodeNonPci: '402',
            description: 'Card Verification Key',
        },
        CSCK: {
            keyTypeCodePci: '402',
            keyTypeCodeNonPci: '402',
            description: 'Card Security Code Key',
        },
        KIA: {
            keyTypeCodePci: '602',
            keyTypeCodeNonPci: '602',
            description: '(AS 2805) Acquirer Initialization Key',
        },
        PPASN: {
            keyTypeCodePci: '802',
            keyTypeCodeNonPci: '802',
            description: '(AS 2805) Acquirer Initialization Key',
        },
        // pair 16-17
        TAK: {
            keyTypeCodePci: '003',
            keyTypeCodeNonPci: '003',
            description: 'Terminal Authentication Key',
        },
        TAKs: {
            keyTypeCodePci: '103',
            keyTypeCodeNonPci: '103',
            description: '(AS 2805) Terminal Authentication Key of Sender',
        },
        TAKr: {
            keyTypeCodePci: '103',
            keyTypeCodeNonPci: '103',
            description: '(AS 2805) Terminal Authentication Key of Recipient',
        },
        // pair 18-19
        DTAB: {
            keyTypeCodePci: '104',
            keyTypeCodeNonPci: '104',
            description: 'Decimalization Table',
        },
        IPB: {
            keyTypeCodePci: '204',
            keyTypeCodeNonPci: '204',
            description: '',
        },
        // pair 20-21
        KML_OBKM: {
            note: 'For use with Optional License HSM9-LIC004',
            keyTypeCodePci: '105',
            keyTypeCodeNonPci: '105',
            description: '(OBKM) Master Load Key',
        },
        KMLISS: {
            keyTypeCodePci: '105',
            keyTypeCodeNonPci: '105',
            description: '(OBKM) Master Load Key for Issuer',
        },
        KMX: {
            keyTypeCodePci: '205',
            keyTypeCodeNonPci: '205',
            description: '(OBKM) Master Currency Exchange Key',
        },
        KMXISS: {
            keyTypeCodePci: '205',
            keyTypeCodeNonPci: '205',
            description: '(OBKM) Master Currency Exchange Key for Issuer',
        },
        KMP: {
            keyTypeCodePci: '305',
            keyTypeCodeNonPci: '305',
            description: '(OBKM) Master Purchase Key',
        },
        KMPISS: {
            keyTypeCodePci: '305',
            keyTypeCodeNonPci: '305',
            description: '(OBKM) Master Purchase Key for Issuer',
        },
        KIS5: {
            keyTypeCodePci: '405',
            keyTypeCodeNonPci: '405',
            description: '(OBKM) S5 Issuer Key',
        },
        KM3L: {
            keyTypeCodePci: '505',
            keyTypeCodeNonPci: '505',
            description: '(OBKM) Master Key for Load & Unload Verification',
        },
        KM3LISS: {
            keyTypeCodePci: '505',
            keyTypeCodeNonPci: '505',
            description: '(OBKM) Master Key for Load & Unload Verification for Issuer',
        },
        KM3X: {
            keyTypeCodePci: '605',
            keyTypeCodeNonPci: '605',
            description: '(OBKM) Master Key for Currency Exchange Verification',
        },
        KM3XISS: {
            keyTypeCodePci: '605',
            keyTypeCodeNonPci: '605',
            description: '(OBKM) Master Key for Currency Exchange Verification for Issuer',
        },
        KMACS4: {
            keyTypeCodePci: '705',
            keyTypeCodeNonPci: '705',
            description: '(OBKM)',
        },
        KMACS5: {
            keyTypeCodePci: '805',
            keyTypeCodeNonPci: '805',
            description: '(OBKM)',
        },
        KMACACQ: {
            keyTypeCodePci: '905',
            keyTypeCodeNonPci: '905',
            description: '(OBKM)',
        },
        KMACACK: {
            keyTypeCodePci: '905',
            keyTypeCodeNonPci: '905',
            description: '(OBKM)',
        },
        // pair 22-23
        WWK: {
            keyTypeCodePci: '006',
            keyTypeCodeNonPci: '006',
            description: 'Watchword Key',
        },
        KMACUPD: {
            keyTypeCodePci: '106',
            keyTypeCodeNonPci: '106',
            description: '(OBKM)',
        },
        KMACMA: {
            keyTypeCodePci: '206',
            keyTypeCodeNonPci: '206',
            description: '(OBKM)',
        },
        KMACCI: {
            keyTypeCodePci: '306',
            keyTypeCodeNonPci: '306',
            description: '(OBKM)',
        },
        KMACISS: {
            keyTypeCodePci: '306',
            keyTypeCodeNonPci: '306',
            description: '(OBKM)',
        },
        KMSCISS: {
            keyTypeCodePci: '406',
            keyTypeCodeNonPci: '406',
            description: '(OBKM) Secure Messaging Master Key',
        },
        BKEM: {
            keyTypeCodePci: '506',
            keyTypeCodeNonPci: '506',
            description: '(OBKM) Transport key for key encryption',
        },
        BKAM: {
            keyTypeCodePci: '606',
            keyTypeCodeNonPci: '606',
            description: '(OBKM) Transport key for message authentication',
        },
        // pair 24-25
        KEK: {
            keyTypeCodePci: '107',
            keyTypeCodeNonPci: '107',
            description: '(Issuing) Key Encryption Key',
        },
        KMC: {
            keyTypeCodePci: '207',
            keyTypeCodeNonPci: '207',
            description: '(Issuing) Master Personalization Key',
        },
        SKENC: {
            keyTypeCodePci: '307',
            keyTypeCodeNonPci: '307',
            description: '(Issuing) Session Key for cryptograms and encrypting card messages',
        },
        SKMAC: {
            keyTypeCodePci: '407',
            keyTypeCodeNonPci: '407',
            description: '(Issuing) Session Key for authenticating card messages',
        },
        SKDEK: {
            keyTypeCodePci: '507',
            keyTypeCodeNonPci: '507',
            description: '(Issuing) Session Key for encrypting secret card data',
        },
        KDPERSO: {
            keyTypeCodePci: '507',
            keyTypeCodeNonPci: '507',
            description: '(Issuing) KD Personalization Key',
        },
        ZKAMK: {
            keyTypeCodePci: '607',
            keyTypeCodeNonPci: '607',
            description: '607 Master key for GBIC/ZKA key derivation',
        },
        MKKE: {
            keyTypeCodePci: '807',
            keyTypeCodeNonPci: '807',
            description: '(Issuing) Master KTU Encipherment key',
        },
        MKAS: {
            keyTypeCodePci: '907',
            keyTypeCodeNonPci: '907',
            description: '(Issuing) Master Application Signature (MAC) key',
        },
        // pair 26-27
        ZAK: {
            keyTypeCodePci: '008',
            keyTypeCodeNonPci: '008',
            description: 'Zone Authentication Key',
        },
        ZAKs: {
            keyTypeCodePci: '108',
            keyTypeCodeNonPci: '108',
            description: '(AS 2805) Zone Authentication Key of Sender',
        },
        ZAKr: {
            keyTypeCodePci: '208',
            keyTypeCodeNonPci: '208',
            description: '(AS 2805) Zone Authentication Key of Recipient',
        },
        // pair 28-29
        BDK1: {
            keyTypeCodePci: '009',
            keyTypeCodeNonPci: '009',
            description: 'Base Derivation Key (type 1)',
        },
        MKAC: {
            keyTypeCodePci: '109',
            keyTypeCodeNonPci: '109',
            description: 'Master Key for Application Cryptograms',
        },
        MKSMI: {
            keyTypeCodePci: '209',
            keyTypeCodeNonPci: '209',
            description: 'Master Key for Secure Messaging (for Integrity)',
        },
        MKSMC: {
            keyTypeCodePci: '309',
            keyTypeCodeNonPci: '309',
            description: 'Master Key for Secure Messaging (for Confidentiality)',
        },
        MKDAC: {
            keyTypeCodePci: '409',
            keyTypeCodeNonPci: '409',
            description: 'Master Key for Data Authentication Codes',
        },
        MKDN: {
            keyTypeCodePci: '509',
            keyTypeCodeNonPci: '509',
            description: 'Master Key for Dynamic Numbers',
        },
        BDK2: {
            keyTypeCodePci: '609',
            keyTypeCodeNonPci: '609',
            description: 'Base Derivation Key (type 2)',
        },
        MKCVC3: {
            keyTypeCodePci: '709',
            keyTypeCodeNonPci: '709',
            description: 'Master Key for CVC3 (Contactless)',
        },
        MKDCVV: {
            keyTypeCodePci: '709',
            keyTypeCodeNonPci: '709',
            description: 'Master Key for CVC3 (Contactless)',
        },
        BDK3: {
            keyTypeCodePci: '809',
            keyTypeCodeNonPci: '809',
            description: 'Base Derivation Key (type 3)',
        },
        BDK4: {
            keyTypeCodePci: '909',
            keyTypeCodeNonPci: '909',
            description: 'Base Derivation Key (type 4)',
        },
        // pair 30-31
        ZEK: {
            keyTypeCodePci: '00A',
            keyTypeCodeNonPci: '00A',
            description: 'Zone Encryption Key',
        },
        ZEKs: {
            keyTypeCodePci: '10A',
            keyTypeCodeNonPci: '10A',
            description: '(AS 2805) Zone Encryption Key of Sender',
        },
        ZEKr: {
            keyTypeCodePci: '20A',
            keyTypeCodeNonPci: '20A',
            description: '(AS 2805) Zone Encryption Key of Recipient',
        },
        // pair 32-33
        DEK: {
            keyTypeCodePci: '00B',
            keyTypeCodeNonPci: '00B',
            description: 'Data Encryption Key',
        },
        TEK_AS2805: {
            note: '(AS 2805) For use with Optional License HSM9-LIC003',
            keyTypeCodePci: '00B',
            keyTypeCodeNonPci: '00B',
            description: '(AS 2805) Terminal Encryption Key',
        },
        TEKs: {
            keyTypeCodePci: '10B',
            keyTypeCodeNonPci: '10B',
            description: '(AS 2805) Terminal Encryption Key of Sender',
        },
        TEKr: {
            keyTypeCodePci: '20B',
            keyTypeCodeNonPci: '20B',
            description: '(AS 2805) Terminal Encryption Key of recipient',
        },
        TEK: {
            keyTypeCodePci: '30B',
            keyTypeCodeNonPci: '30B',
            description: 'Terminal Encryption Key',
        },
        // pair 34-35
        RSASK: {
            keyTypeCodePci: '00C',
            keyTypeCodeNonPci: '00C',
            description: 'RSA Private Key',
        },
        HMAC: {
            keyTypeCodePci: '10C',
            keyTypeCodeNonPci: '10C',
            description: 'HMAC key',
        },
        // pair 36-37
        RSAPK: {
            keyTypeCodePci: '00D',
            keyTypeCodeNonPci: '00D',
            description: 'RSA Public Key',
        },
        CKENK: {
            keyTypeCodePci: '30D',
            keyTypeCodeNonPci: '30D',
            description: '(Issuing) Card Key for Cryptograms',
        },
        CKMAC: {
            keyTypeCodePci: '40D',
            keyTypeCodeNonPci: '40D',
            description: '(Issuing) Card Key for Authentication',
        },
        CKDEK: {
            keyTypeCodePci: '50D',
            keyTypeCodeNonPci: '50D',
            description: '(Issuing) Card Key for Authentication',
        },
    },
}));
