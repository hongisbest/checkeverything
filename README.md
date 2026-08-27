# Vehicle Sticker Check V4

V4는 전/후면 카메라를 facingMode fallback으로 바꾸지 않고,
enumerateDevices()로 장치 목록을 읽은 뒤 deviceId exact 방식으로 직접 선택합니다.

## 핵심
- 카메라 권한 먼저 확보
- 실제 videoinput 목록 조회
- 전면/후면 장치 추정
- deviceId exact로 카메라 선택
- 실패 시 다른 카메라로 자동 전환하지 않음
- 카메라 목록 화면 표시
- V2 스타일의 실시간 카메라 + 기준사진 오버레이 유지
