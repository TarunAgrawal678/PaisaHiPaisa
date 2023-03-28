// countdown test
function myFunction() {
  console.log("This function is executed every 9 minutes.");
}

function startCountdown() {
  let countdown = 9 * 60; // in seconds

  setInterval(function () {
    if (countdown === 0) {
      countdown = 9 * 60; // reset the countdown to 9 minutes
      myFunction(); // execute the function
    } else {
      let minutes = Math.floor(countdown / 60);
      let seconds = countdown % 60;
      document.getElementById("minutes").innerHTML = `${minutes}:`;
      document.getElementById("seconds").innerHTML = `${
        seconds < 10 ? "0" : ""
      }${seconds}`;
      countdown--;
    }
  }, 1 * 1000); // 1 minute in milliseconds
}
startCountdown(); // start the countdown

function confirmBet() {
  alert("bet placed");
}
