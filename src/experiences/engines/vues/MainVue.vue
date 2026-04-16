<script setup lang="ts">
import MediapipeView from '../../views/mediapipe/MediapipeView.vue';
import IntroView from '../../views/vues/Intro/IntroView.vue';
import LoaderView from '../../views/vues/LoaderView.vue';
import LoaderManager from '../../managers/LoaderManager';
import { onMounted, ref } from 'vue';

const isVisible = ref(false);
const buttonVisible = ref(true);

onMounted(() => {
    LoaderManager.onHide.add(onShow);
});

const onShow = (): void => {
    isVisible.value = true;
};

const onHide = (): void => {
    buttonVisible.value = false;
};

</script>

<template>
    <div id="loader">
        <LoaderView />
    </div>
    <div class="intro-button" id="webcamButton" v-if="buttonVisible" @click="onHide">
        <p>Commencer l'expérience</p>
    </div>
    <!-- <div v-if="isVisible">
        <IntroView />
    </div> -->
    <div class="mediapipe-container">
        <MediapipeView />
    </div>
</template>

<style lang="scss" scoped>
@import url('https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,100;0,300;0,400;0,700;0,900;1,100;1,300;1,400;1,700;1,900&display=swap');
.intro-button {
    font-family: 'Lato', sans-serif;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 101;
    background-color: #2C2A32;
    color: white;
    padding: 16px 32px;
    border-radius: 80px;
    
    :hover {
        cursor: pointer;
    }
}
</style>
