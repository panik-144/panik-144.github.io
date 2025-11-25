n=int(input("how often do you want to run the simulation? "))
import random
win = 0
lose = 0

for i in range(1,n+1):
    doors = ["goat", "goat", "car"]
    door1=doors[random.randint(0,2)]
    doors.remove(door1)
    door2=doors[random.randint(0,1)]
    doors.remove(door2)
    door3=doors[0]
    doors.remove(door3)
    #print(f"door1: {door1}, door2: {door2}, door3: {door3}")
    doors = ["goat", "goat", "car"]
    doorslist=["door1","door2","door3"]
    guess=doorslist[random.randint(0,2)]
    if guess=="door1":
        doors.remove(door1)
    elif guess=="door2":
        doors.remove(door2)
    elif guess=="door3":
        doors.remove(door3)
    doors.remove("goat")
    newguess=doors[0]
    if newguess=="car":
        win+=1
    else:
        lose+=1
        

    
print(f"win: {win}, lose: {lose}")
print(f"win rate: {round(win/n,4)*100}%")