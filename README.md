# Vehicle Sticker Check

법인차량 홍보스티커 셀프점검 시스템 테스트 버전입니다.

## 현재 기능

- 정상 기준사진 선택
- 현재 차량사진 선택 / 모바일 촬영
- 선택한 사진 브라우저 화면 표시
- PC / 모바일 반응형 UI

## 현재 미포함 기능

- 서버 저장
- 로그인
- 차량 DB
- 기준사진 오버레이
- 자동 이미지 비교
- 관리자 대시보드

## 파일 구조

```text
vehicle-sticker-check/
├─ index.html
├─ css/
│  └─ style.css
├─ js/
│  └─ app.js
└─ README.md
```

## 배포

GitHub 저장소에 전체 파일을 업로드한 뒤 Cloudflare Workers/Pages 프로젝트와 저장소를 연결합니다.

현재 버전은 순수 HTML/CSS/JavaScript로 작성되어 별도의 빌드 과정이 필요하지 않습니다.
