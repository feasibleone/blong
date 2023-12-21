import assert from 'node:assert';
import { test } from 'node:test';

import jose from './jose.js';

test('jose', async t => {
    const {signEncrypt, decryptVerify} = await jose({
        encrypt: {
            kty: 'EC',
            d: 'Irx1Kg78ZY4xZPH_sNMWIe8ifpSB_6f9HZ-JRJiVMae0b_bitAC7Wld03t6KzCdB',
            use: 'enc',
            crv: 'P-384',
            x: 'f-qS0J9HcmWeU2zmDYnjCMwcsEw9ozb0_XE5y2hi2NKUJEyTgeMuWynBpexlhXbS',
            y: '22-bZgbttgc4G5lXBsoVMMV5-TYg41FjJY2uGtlJp-MSfJ2agzouRjpzrCihXi7z',
            alg: 'ECDH-ES+A256KW'
        },
        sign: {
            kty: 'EC',
            d: 'zmnSC_P5Xzefte7vkdINXLAN2LeBgC0S5QTcPO2mI5vo62chc_zHAYhcobGPQGNJ',
            use: 'sig',
            crv: 'P-384',
            x: 'G4JWlybVRkliYWLLFdXDj0CjMjnkXeyiunzQswR3izK-jxvMIYdjVB52Rty5yZN9',
            y: 'JndKKF7RQf97idkaLPLsv_jkZPBw-MJFogDqri87vvnpAEf1qyHnQTmK_gAhLAgo',
            alg: 'ES384'
        }
    });

    assert.ok(await signEncrypt({age: 1}, {
        d: '3UScww8iqdRaBeTraC61WCFoO3fisO9A0p49P_GI6BuZO26-WUyElUWoKyhkcbeI',
        kty: 'EC',
        use: 'enc',
        crv: 'P-384',
        x: 's8uFX_D-Ow5Q6UoRs6tFDBDkpdpcsueSl7-oyPpBFdgY6Co9L2AZknuqA4vDSKe4',
        y: 'IffoB24bdS2nk699nXMB4cVe7LgLdinCKNGgrgcPHlPXnqfdJ7T5DLucLLJP0DQA',
        alg: 'ECDH-ES+A256KW'
    }));

    assert.ok(await decryptVerify({ciphertext: 'jWWVGktVNw5aXodOp4l3EOpOj_zdwuRuZsGR_8RD_MewNeTdMVkkWZDV00kMX-C2JjgWvVB5qhJUZU2FiUcRhW59Jx2UEE5_VBQ13l5lQoHK_MyO_Js5hMTUh8_853_bDu5Ni2OwoTGIrh0PGxxMQRdQwbdbZokSqmpNcGU0yNOlAymKRVMW9zSpy_g6ZviLUqlqzDqc2J7f0a7M3w6LBCdtDhHtDwTC_jyFFF4t00RsnFmwzco_RmqfvJZAtbQ2e7rZjMyTNIIfU9Qzcxt9Ecj3rar6QhNTZ_-LiHy3qCg6mzsLL5Lha6l6i495oYgVkSFMBkZqA78FYNmb-wpY909jWd6hQqWtzAKTZcc_x3jWKEKh0yMCSaiOq1i7NLyv_eaHrIN8bdJxKce_peTPPjazW-VJ4WNDPBt7RmrIWAZo1oQpfU1FVIMewDH4b1rvDYBgyLEG3oO0ZydCwwMpdzSrJjGmqy0Dlx_s7GWXxT0lvpbxPu_tmFD3Ec_f1cLws-IBEuJIcOQJlJV3XM0_Q_8LZNA59RlJLfUS2rgQ9nX6jq6DMpEjpVRnOhBMT02NOdfAuVkTq5WoVvq_w9nri1nWteBpxnLH_jOS28JKRW0Mft6ybCYtTwJoAZaze64OQqRqkPUPouGneGR2OEoUxkY3cctXBdH67zukvC2A_6EFAgJ4vfb7yS__xwCe471X89qtjSKYQJLuKnpEMloX6fsrL2lVhK6xjYAinfjw71do2zsAM-W7WEt1yQ-PUjCmc0YNVLBHzA6pSAjMWL7egGRPwSV7CeufTSInmZF240MjC7oCqRJFv7M2sGBO0YMriaxUTU5nlLKG8_ek4rfHrlrYFYyvMy0bsz_uskbxPn2NNxvIhtDzz3wdILuiOEcdq2N4yuvVcAN16xMncuMU4-63Zil5TKqcNLhnwJbXInmZ9ZcNCVVzPq6zBrc2hdVuorA57V70Yj-_NXVdPhSegCFNkrHnBE2PkeEvMOcNYl0mlW-7s7nEpxsyXeROl_hpo1HLk5IzQT6VV3AvrZMan4Zgp2e0LiT-gWktNyKy30mGeijwRHt_mnjb9RjzEdFQzkVUZ3iWz_X3XK67Pvzcd0LLYJcjLnuZqxr4O9CY1wummxcBBdP_wZXdNjkvdsfIwVHoDhtpRyqi4hObrZ_7Pw', iv: 'DDbA7pkNqspnqgaF-RUBaQ', recipients: [{encrypted_key: '9B1BPOid-4wqjkYpFuO6AxO5u13H4aNb2A3J-Y5K8-5JvGWjAJubAg'}], tag: 'QbNYNRERfIuhQbwv5di5CQ', protected: 'eyJhbGciOiJFQ0RILUVTK0EyNTZLVyIsImVuYyI6IkExMjhDQkMtSFMyNTYiLCJlcGsiOnsieCI6IlVuZDBSTUxOVUtZZmtLTkYyT24yOWhEYVdVOUw4NTBpd1MyQTVjclRxTE1CVkNtSnVyUy1rOVBpZVYtNHZBQUwiLCJjcnYiOiJQLTM4NCIsImt0eSI6IkVDIiwieSI6IjN4djEydFg2cl9TeUtuRlRUMUd5a0dZQjIyOVFOU0pSV1ZDSDVreVdGTG54d25CTUxzaE04cDM2LUV6OXg0SkQifX0'}, {
        kty: 'EC',
        d: 'BYfl8to6zRfjjm7jFYtY5i_BwR2jXspsv1HDN0OLIaz-tUiACKZBeRruaLzBrHXJ',
        use: 'sig',
        crv: 'P-384',
        x: 'pM8gcPvgdKrKaxQmIC7Q67AvV7KteWqU5I4X83ErVinZnAgeT1KwfhCYssD3YNvK',
        y: 'SVsvfEm3CVu2WjOho2frL7LnaXeOQHC1JT856bOH-Vp3E-4_1j2Kp9KHJJf7Qn1v',
        alg: 'ES384'
    }));
});
