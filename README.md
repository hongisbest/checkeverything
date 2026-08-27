# Vehicle Sticker Check V3

법인차량 홍보스티커 셀프점검 시스템의 카메라 진단 버전입니다.

## V3 핵심 변경

- V2의 웹페이지 내 실시간 카메라 UI 유지
- 전면 / 후면 카메라 버튼 분리
- facingMode exact 우선 요청
- 실패 시 ideal 방식 fallback
- 현재 실제 카메라 track label 표시
- 실제 facingMode 표시
- 실제 해상도 표시
- stream LIVE 상태 표시
- 기준사진 반투명 overlay 유지
- 웹페이지 내 촬영 결과 표시

## iPhone 테스트 시 확인

1. Cloudflare HTTPS 주소에서 접속
2. 카메라 권한 허용
3. `카메라 시작`
4. `후면 카메라` 버튼
5. 아래 진단값 확인
   - 현재 카메라
   - Facing Mode
   - Stream = LIVE
6. `전면 카메라` 버튼을 눌러 값이 바뀌는지 확인

화면이 검게 나오는데 Stream은 LIVE인 경우, 해당 화면과 진단값을 캡처해 원인 확인에 사용합니다.
